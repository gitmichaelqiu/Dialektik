class GoogleDocLink {
  const GoogleDocLink._({required this.documentId, required this.editUrl});

  factory GoogleDocLink.parse(String value) {
    final uri = Uri.tryParse(value.trim());
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.host.toLowerCase() != 'docs.google.com') {
      throw const FormatException('Enter a valid Google Docs link.');
    }

    final segments = uri.pathSegments;
    if (segments.length < 3 ||
        segments[0] != 'document' ||
        segments[1] != 'd' ||
        !_documentId.hasMatch(segments[2])) {
      throw const FormatException('Enter a Google Docs document link.');
    }

    final documentId = segments[2];
    return GoogleDocLink._(
      documentId: documentId,
      editUrl: Uri(
        scheme: 'https',
        host: 'docs.google.com',
        pathSegments: ['document', 'd', documentId, 'edit'],
      ),
    );
  }

  static final RegExp _documentId = RegExp(r'^[a-zA-Z0-9_-]+$');

  final String documentId;
  final Uri editUrl;
}
