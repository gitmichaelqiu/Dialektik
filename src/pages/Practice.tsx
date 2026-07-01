import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { db, type PracticeSession } from "../services/db";
import { AIService } from "../services/ai";
import { Bot, User, Play, MessageSquare, Award, RefreshCw, Send, ArrowRight } from "lucide-react";

export const Practice: React.FC = () => {
  const { aiApiKey, aiEndpoint, aiModel } = useApp();
  const [topic, setTopic] = useState("");
  const [side, setSide] = useState<"affirmative" | "negative">("affirmative");
  const [isSessionActive, setIsSessionActive] = useState(false);

  const [activeSession, setActiveSession] = useState<PracticeSession | null>(null);
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string; timestamp: number }[]>([]);
  const [userInput, setUserInput] = useState("");

  const [isLoading, setIsLoading] = useState(false);

  // Load latest session from DB on mount
  useEffect(() => {
    loadLatestSession();
  }, []);

  async function loadLatestSession() {
    const sessions = await db.practice_sessions.toArray();
    if (sessions.length > 0) {
      sessions.sort((a, b) => b.timestamp - a.timestamp);
      setActiveSession(sessions[0]);
      setMessages(sessions[0].transcripts);
    }
  }

  const handleStartPractice = async () => {
    if (!topic.trim()) {
      alert("Please enter a debate topic to start sparring.");
      return;
    }

    setIsLoading(true);
    const newSession: PracticeSession = {
      id: `practice-${Math.random().toString(36).substring(2, 11)}`,
      topic,
      side,
      transcripts: [
        {
          role: "ai",
          text: `Hello! I am your AI sparring partner. We are debating the topic: "${topic}". You are representing the ${side.toUpperCase()} side. Please begin with your constructive speech. I am ready to flow and counter!`,
          timestamp: Date.now()
        }
      ],
      timestamp: Date.now()
    };

    await db.practice_sessions.put(newSession);
    setActiveSession(newSession);
    setMessages(newSession.transcripts);
    setIsSessionActive(true);
    setIsLoading(false);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim() || !activeSession) return;

    const userMsg = {
      role: "user" as const,
      text: userInput,
      timestamp: Date.now()
    };

    const updatedMsgs = [...messages, userMsg];
    setMessages(updatedMsgs);
    setUserInput("");
    setIsLoading(true);

    try {
      let aiResponseText = "";
      let scorecardEval = activeSession.scorecard;

      if (aiApiKey) {
        const ai = new AIService({
          apiKey: aiApiKey,
          endpoint: aiEndpoint,
          model: aiModel
        });

        // 1. Get AI response for sparring
        aiResponseText = await ai.sparringPartner(
          activeSession.topic,
          activeSession.side,
          updatedMsgs
        );

        // 2. Perform speech evaluation to get updated scorecard
        const combinedMsgs = [...updatedMsgs, { role: "ai", text: aiResponseText, timestamp: Date.now() }];
        try {
          scorecardEval = await ai.evaluateSpeech(
            activeSession.topic,
            activeSession.side,
            combinedMsgs
          );
        } catch (evalErr) {
          console.warn("Failed to generate real AI scorecard, retaining previous or fallback", evalErr);
        }
      } else {
        // Fallback simulated response
        await new Promise((resolve) => setTimeout(resolve, 1200));
        aiResponseText = `Thank you for your constructive speech. On the point regarding ${topic.substring(0, 15)}..., you suggest a positive outcome, but you fail to account for structural roadblocks. Specifically, how do you mitigate the risk of high implementation friction? Overlooking this renders the solvency argument moot. Your turn for rebuttal!`;
        if (updatedMsgs.filter(m => m.role === "user").length >= 1) {
          scorecardEval = {
            score: 82,
            strengths: [
              "Clear articulation of topic contention",
              "Effective referencing of structural factors"
            ],
            weaknesses: [
              "Lacks specific empirical evidence on trade offset",
              "Minor structural padding in intro"
            ],
            suggestions: [
              "Integrate a concrete card citation regarding implementation offset",
              "Reduce intro length to preserve time for contentions"
            ]
          };
        }
      }

      const aiMsg = {
        role: "ai" as const,
        text: aiResponseText,
        timestamp: Date.now()
      };

      const finalMsgs = [...updatedMsgs, aiMsg];
      setMessages(finalMsgs);

      await db.practice_sessions.update(activeSession.id, {
        transcripts: finalMsgs,
        scorecard: scorecardEval
      });

      setActiveSession(prev => prev ? { ...prev, transcripts: finalMsgs, scorecard: scorecardEval } : null);
    } catch (err: any) {
      console.error("Sparring request failed:", err);
      alert(`Sparring request failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6 overflow-hidden">
      {/* Left Pane: Sparring Arena Chat */}
      <section className="flex-1 bg-slate-950 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
        {/* Topic config header */}
        {!isSessionActive && !activeSession ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto space-y-6">
            <Bot size={44} className="text-indigo-400 animate-pulse" />
            <div>
              <h3 className="text-base font-bold text-white">AI Sparring Partner Arena</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Spar against a world-class AI debater. Practice constructive arguments, test counter-plans, and receive a comprehensive performance evaluation.
              </p>
            </div>

            <div className="w-full space-y-3">
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Enter debate topic resolution..."
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
              <div className="flex items-center justify-between">
                <div className="bg-slate-900 p-0.5 rounded-lg border border-slate-800 flex">
                  <button
                    onClick={() => setSide("affirmative")}
                    className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                      side === "affirmative" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Affirmative
                  </button>
                  <button
                    onClick={() => setSide("negative")}
                    className={`px-3 py-1.5 rounded text-xs font-bold transition-all ${
                      side === "negative" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Negative
                  </button>
                </div>
                <button
                  onClick={handleStartPractice}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-5 py-2.5 rounded-lg transition-colors flex items-center gap-1.5 h-[34px]"
                >
                  <Play size={12} /> Start Sparring
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Active session bar */}
            <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Debating Resolution</span>
                <strong className="text-xs text-white truncate max-w-md block">
                  {activeSession?.topic}
                </strong>
              </div>
              <button
                onClick={() => {
                  setIsSessionActive(false);
                  setActiveSession(null);
                  setMessages([]);
                }}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
              >
                Reset Sparring
              </button>
            </div>

            {/* Conversation logs */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 max-w-xl ${
                    msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                  }`}
                >
                  {/* Icon */}
                  <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center border ${
                    msg.role === "user" 
                      ? "bg-indigo-600/10 text-indigo-400 border-indigo-500/20" 
                      : "bg-slate-900 text-slate-300 border-slate-800"
                  }`}>
                    {msg.role === "user" ? <User size={14} /> : <Bot size={14} />}
                  </div>

                  {/* Bubble */}
                  <div className={`p-4 rounded-xl text-xs leading-relaxed space-y-1 ${
                    msg.role === "user"
                      ? "bg-indigo-600/15 text-indigo-300 border border-indigo-500/25 rounded-tr-none"
                      : "bg-slate-900 text-slate-300 border border-slate-850 rounded-tl-none"
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                    <span className="text-[9px] text-slate-500 font-mono block text-right pt-1">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3 mr-auto items-center text-xs text-slate-500 font-medium">
                  <Bot size={14} className="animate-pulse" />
                  AI is analyzing your speech...
                  <RefreshCw size={12} className="animate-spin text-indigo-500" />
                </div>
              )}
            </div>

            {/* Message input */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-800 bg-slate-950/40 flex gap-2">
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Enter your constructive speech, arguments, or rebuttal response..."
                className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 text-xs text-slate-100 placeholder-slate-650 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={isLoading || !userInput.trim()}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white p-2.5 rounded-lg transition-colors flex items-center justify-center"
              >
                <Send size={14} />
              </button>
            </form>
          </>
        )}
      </section>

      {/* Right Pane: AI Scorecard Evaluation */}
      <aside className="w-80 bg-slate-950 border border-slate-800 rounded-xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center gap-2">
          <Award size={18} className="text-indigo-400" />
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Practice Scorecard</h3>
        </div>

        {activeSession?.scorecard ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Score circle */}
            <div className="text-center py-4 bg-slate-900 rounded-xl border border-slate-800 space-y-1 shadow-inner">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Evaluation Score</span>
              <div className="text-4xl font-extrabold text-indigo-400">{activeSession.scorecard.score}<span className="text-slate-600 text-lg">/100</span></div>
            </div>

            {/* Strengths */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Key Strengths</h4>
              <ul className="space-y-1.5 list-disc pl-4 text-xs text-slate-350">
                {activeSession.scorecard.strengths.map((str, idx) => (
                  <li key={idx}>{str}</li>
                ))}
              </ul>
            </div>

            {/* Weaknesses */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">Weaknesses</h4>
              <ul className="space-y-1.5 list-disc pl-4 text-xs text-slate-350">
                {activeSession.scorecard.weaknesses.map((weak, idx) => (
                  <li key={idx}>{weak}</li>
                ))}
              </ul>
            </div>

            {/* Recommendations */}
            <div className="space-y-2">
              <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">AI Action Suggestions</h4>
              <ul className="space-y-2 text-xs text-slate-350">
                {activeSession.scorecard.suggestions.map((sug, idx) => (
                  <li key={idx} className="flex gap-1.5 items-start">
                    <ArrowRight size={12} className="text-indigo-400 shrink-0 mt-0.5" />
                    <span>{sug}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs p-6 text-center gap-2">
            <MessageSquare size={28} className="text-slate-700" />
            <span>Scorecard and ratings will render here after the first speech exchange is completed.</span>
          </div>
        )}
      </aside>
    </div>
  );
};
export default Practice;
