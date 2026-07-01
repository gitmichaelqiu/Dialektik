import { Octokit } from "octokit";
import { db } from "./db";
import { encryptData, decryptData } from "./crypto";

export interface GitHubSyncConfig {
  token: string;
  repoOwner: string;
  repoName: string;
  passphraseKey: CryptoKey; // derived crypto key for encrypting case files
}

/**
 * Service to sync local IndexedDB documents with a GitHub repository
 * using Octokit and AES-GCM client-side encryption.
 */
export class GitHubSyncService {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private key: CryptoKey;

  constructor(config: GitHubSyncConfig) {
    this.octokit = new Octokit({ auth: config.token });
    this.owner = config.repoOwner;
    this.repo = config.repoName;
    this.key = config.passphraseKey;
  }

  /**
   * Helper to check if repository exists and token is valid
   */
  async validateConfig(): Promise<boolean> {
    try {
      await this.octokit.rest.repos.get({
        owner: this.owner,
        repo: this.repo
      });
      return true;
    } catch (error) {
      console.error("GitHub Config Validation Failed:", error);
      return false;
    }
  }

  /**
   * Pulls encrypted documents from the GitHub repository and merges them locally.
   * Handles conflicts by creating conflict files ([Name]_conflict_[Timestamp].md).
   */
  async pull(): Promise<void> {
    try {
      // 1. Get all contents in the 'docs' directory of the repo
      let files: any[] = [];
      try {
        const response = await this.octokit.rest.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: "docs"
        });
        if (Array.isArray(response.data)) {
          files = response.data;
        }
      } catch (err: any) {
        // Directory might not exist yet if repository is fresh, that's fine
        if (err.status !== 404) {
          throw err;
        }
        return;
      }

      // 2. Process each file
      for (const file of files) {
        if (!file.name.endsWith(".json")) continue;

        const fileContentRes = await this.octokit.rest.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path: file.path
        });

        if ("content" in fileContentRes.data) {
          const rawBase64 = fileContentRes.data.content.replace(/\n/g, "");
          const rawJson = atob(rawBase64);
          const encryptedPayload = JSON.parse(rawJson);

          // Decrypt payload fields
          const name = await decryptData(encryptedPayload.encryptedName, this.key);
          const content = await decryptData(encryptedPayload.encryptedContent, this.key);
          const id = encryptedPayload.id;
          const type = encryptedPayload.type;
          const remoteLastModified = encryptedPayload.lastModified;

          // Check if document exists locally
          const localDoc = await db.documents.get(id);

          if (!localDoc) {
            // Document doesn't exist, create it locally
            await db.documents.put({
              id,
              name,
              type,
              content,
              lastModified: remoteLastModified
            });
          } else {
            // Document exists, check for conflicts
            // If remote is newer
            if (remoteLastModified > localDoc.lastModified) {
              // Did local file change since last sync?
              // For safety in offline prep, we verify if they differ. If they differ, it is a conflict.
              if (localDoc.content !== content) {
                const timestampStr = new Date(remoteLastModified).toISOString().replace(/[:.]/g, "-");
                const conflictName = `${name.replace(/\.[^/.]+$/, "")}_conflict_${timestampStr}.md`;
                
                // Write conflict file locally
                await db.documents.put({
                  id: `${id}_conflict_${Date.now()}`,
                  name: conflictName,
                  type: localDoc.type,
                  content: localDoc.content, // save our local edits as the conflict file
                  lastModified: Date.now()
                });

                // Update original file with remote contents
                await db.documents.put({
                  id,
                  name,
                  type,
                  content,
                  lastModified: remoteLastModified
                });
              } else {
                // Contents are identical, just update timestamp
                await db.documents.update(id, { lastModified: remoteLastModified });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("GitHub Sync Pull Failed:", error);
      throw error;
    }
  }

  /**
   * Pushes all local documents to the GitHub repository.
   * Serializes documents, encrypts them, and commits them under generic messages.
   */
  async push(): Promise<void> {
    try {
      const localDocs = await db.documents.toArray();
      const timestamp = new Date().toISOString();

      for (const doc of localDocs) {
        // Skip syncing conflict files to remote to avoid polluting the repo
        if (doc.id.includes("_conflict_")) continue;

        // Encrypt document fields
        const encryptedName = await encryptData(doc.name, this.key);
        const encryptedContent = await encryptData(doc.content, this.key);

        const payload = {
          id: doc.id,
          type: doc.type,
          lastModified: doc.lastModified,
          encryptedName,
          encryptedContent
        };

        const serializedPayload = JSON.stringify(payload, null, 2);
        const base64Content = btoa(unescape(encodeURIComponent(serializedPayload)));

        const filePath = `docs/${doc.id}.json`;
        let sha: string | undefined = undefined;

        // Check if file exists to get SHA
        try {
          const res = await this.octokit.rest.repos.getContent({
            owner: this.owner,
            repo: this.repo,
            path: filePath
          });
          if (!Array.isArray(res.data) && "sha" in res.data) {
            sha = res.data.sha;
          }
        } catch (err: any) {
          if (err.status !== 404) {
            throw err;
          }
        }

        // Write file (create or update)
        await this.octokit.rest.repos.createOrUpdateFileContents({
          owner: this.owner,
          repo: this.repo,
          path: filePath,
          message: `Update: Case Files - [${timestamp}]`, // Genericized commits
          content: base64Content,
          sha
        });
      }
    } catch (error) {
      console.error("GitHub Sync Push Failed:", error);
      throw error;
    }
  }
}
