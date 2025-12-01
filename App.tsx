import React, { useState, useEffect, useRef } from 'react';
import { LEVELS, TOPICS } from './constants';
import { CEFRLevel, LevelDetails, Topic, ViewState, EvaluationResult, HistoryItem } from './types';
import { generateQuestion, evaluateAnswer, getQuickTip, transcribeAudio, generateSpeech } from './services/geminiService';
import { saveHistoryItem, getHistory, clearHistory } from './services/historyService';
import LiveConversation from './components/LiveConversation';

// --- Reusable Components ---

const BrandLogo = ({ size = 'medium' }: { size?: 'small' | 'medium' | 'large' }) => {
  const sizeClasses = {
    small: 'text-2xl',
    medium: 'text-4xl',
    large: 'text-6xl'
  };
  
  return (
    <div className={`font-serif tracking-tighter font-bold text-amber-400 ${sizeClasses[size]}`}>
      <span className="italic">The</span> <span className="uppercase tracking-widest ml-1">Buzz</span>
    </div>
  );
};

const Button = ({ 
  onClick, 
  children, 
  variant = 'primary', 
  className = '', 
  disabled = false,
  fullWidth = false 
}: { 
  onClick: () => void, 
  children: React.ReactNode, 
  variant?: 'primary' | 'secondary' | 'outline' | 'danger',
  className?: string,
  disabled?: boolean,
  fullWidth?: boolean
}) => {
  const baseStyles = "py-4 px-6 rounded-xl font-bold transition-all duration-300 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2";
  const variants = {
    primary: "bg-amber-500 text-black hover:bg-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:shadow-[0_0_25px_rgba(245,158,11,0.5)] border border-amber-500",
    secondary: "bg-neutral-800 text-white hover:bg-neutral-700 border border-neutral-700",
    outline: "bg-transparent text-amber-500 border border-amber-500/30 hover:border-amber-500 hover:bg-amber-500/10",
    danger: "bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500 hover:text-white"
  };

  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      className={`${baseStyles} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {children}
    </button>
  );
};

const Card = ({ 
  children, 
  className = '', 
  onClick, 
  animate = true 
}: { 
  children: React.ReactNode, 
  className?: string, 
  onClick?: () => void,
  animate?: boolean
}) => {
  return (
    <div 
      onClick={onClick}
      className={`
        bg-neutral-900 border border-neutral-800 rounded-2xl p-6 
        ${onClick ? 'cursor-pointer hover:border-amber-500/50 hover:bg-neutral-800/80 transition-all duration-300' : ''}
        ${animate ? 'animate-slide-up' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
};

function App() {
  // State
  const [view, setView] = useState<ViewState>('SPLASH');
  const [level, setLevel] = useState<LevelDetails | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  
  const [question, setQuestion] = useState<string>('');
  const [userAnswer, setUserAnswer] = useState<string>('');
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingText, setLoadingText] = useState<string>('Loading...');
  const [quickTip, setQuickTip] = useState<string>('');
  
  // History State
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [fromHistory, setFromHistory] = useState<boolean>(false);
  
  // History Filters & Sort
  const [historyFilterLevel, setHistoryFilterLevel] = useState<string>('ALL');
  const [historySort, setHistorySort] = useState<'NEWEST' | 'OLDEST' | 'HIGHEST' | 'LOWEST'>('NEWEST');
  
  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Splash Screen Timer
  useEffect(() => {
    if (view === 'SPLASH') {
      const timer = setTimeout(() => {
        setView('HOME');
      }, 3000); // 3 seconds splash
      return () => clearTimeout(timer);
    }
  }, [view]);

  // Helper: Go back navigation
  const goBack = () => {
    if (view === 'EVALUATION') {
      if (fromHistory) {
        setView('HISTORY');
        setFromHistory(false);
      } else {
        setView('QUESTION');
      }
    }
    else if (view === 'QUESTION') setView('TOPICS');
    else if (view === 'TOPICS') setView('HOME');
    else if (view === 'LIVE_CONVERSATION') setView('HOME');
    else if (view === 'HISTORY') setView('HOME');
  };

  // 1. Select Level
  const handleLevelSelect = async (selectedLevel: LevelDetails) => {
    setLevel(selectedLevel);
    setView('TOPICS');
    const tip = await getQuickTip(selectedLevel.id);
    setQuickTip(tip);
  };

  // 2. Select Topic & Generate Question
  const handleTopicSelect = async (selectedTopic: Topic) => {
    if (!level) return;
    setTopic(selectedTopic);
    setLoadingText("Crafting your question...");
    setLoading(true);
    setView('QUESTION');
    setUserAnswer('');
    setEvaluation(null);
    setFromHistory(false);

    try {
      // Get history to avoid repetition
      const savedHistory = getHistory();
      const previousQuestions = savedHistory
        .filter(h => h.levelId === level.id && h.topicName === selectedTopic.name)
        .map(h => h.question)
        .slice(0, 15); // Take last 15 unique questions to avoid

      const q = await generateQuestion(level.id, selectedTopic.name, previousQuestions);
      setQuestion(q);
    } catch (e) {
      setQuestion("Could not load question. Please go back and try again.");
    } finally {
      setLoading(false);
    }
  };

  // 3. Handle Voice Input (Transcription)
  const toggleRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        const audioChunks: Blob[] = [];

        mediaRecorder.ondataavailable = (event) => {
          audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          setLoadingText("Transcribing audio...");
          setLoading(true);
          try {
            const transcript = await transcribeAudio(audioBlob);
            setUserAnswer(prev => prev + (prev ? ' ' : '') + transcript);
          } catch (e) {
            console.error(e);
            alert("Failed to transcribe audio.");
          } finally {
            setLoading(false);
          }
          stream.getTracks().forEach(t => t.stop());
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (e) {
        alert("Microphone access denied or not available.");
      }
    }
  };

  // 4. Submit Answer for Evaluation & Save History
  const handleSubmit = async () => {
    if (!level || !topic || !userAnswer) return;
    setLoadingText("Analyzing your response...");
    setLoading(true);
    try {
      const result = await evaluateAnswer(level.id, topic.name, question, userAnswer);
      setEvaluation(result);
      
      // Save to History
      const historyItem: HistoryItem = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        levelId: level.id,
        topicName: topic.name,
        question: question,
        userAnswer: userAnswer,
        evaluation: result
      };
      saveHistoryItem(historyItem);
      
      setView('EVALUATION');
    } catch (e) {
      alert("Error evaluating answer. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // 5. Play Model Answer (TTS)
  const playModelAnswer = async () => {
    if (!evaluation?.professional_model_answer) return;
    try {
      const audioBuffer = await generateSpeech(evaluation.professional_model_answer);
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const decodedBuffer = await audioCtx.decodeAudioData(audioBuffer);
      const source = audioCtx.createBufferSource();
      source.buffer = decodedBuffer;
      source.connect(audioCtx.destination);
      source.start(0);
    } catch (e) {
      console.error(e);
      alert("Could not play audio.");
    }
  };

  // 6. Handle Next Question
  const handleNextQuestion = async () => {
    if (!level || !topic) return;
    
    // Reset states
    setLoadingText("Generating new question...");
    setLoading(true);
    setView('QUESTION');
    setUserAnswer('');
    setEvaluation(null);
    setFromHistory(false);

    try {
      // Get history to avoid repetition
      const savedHistory = getHistory();
      const previousQuestions = savedHistory
        .filter(h => h.levelId === level.id && h.topicName === topic.name)
        .map(h => h.question)
        .slice(0, 15); // Take last 15 unique questions to avoid

      const q = await generateQuestion(level.id, topic.name, previousQuestions);
      setQuestion(q);
    } catch (e) {
      setQuestion("Could not generate a new question. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // 7. History Management
  const loadHistory = () => {
    const data = getHistory();
    setHistory(data);
    setView('HISTORY');
    setHistoryFilterLevel('ALL');
    setHistorySort('NEWEST');
  };

  const handleClearHistory = () => {
    if (confirm("Are you sure you want to clear your practice history?")) {
      clearHistory();
      setHistory([]);
    }
  };

  const openHistoryItem = (item: HistoryItem) => {
    const savedLevel = LEVELS.find(l => l.id === item.levelId) || LEVELS[0];
    const savedTopic = TOPICS.find(t => t.name === item.topicName) || { id: 'unknown', name: item.topicName, icon: '📝' };
    
    setLevel(savedLevel);
    setTopic(savedTopic);
    setQuestion(item.question);
    setUserAnswer(item.userAnswer);
    setEvaluation(item.evaluation);
    
    setFromHistory(true);
    setView('EVALUATION');
  };

  const getFilteredHistory = () => {
    return history.filter(item => {
        if (historyFilterLevel !== 'ALL' && item.levelId !== historyFilterLevel) return false;
        return true;
    }).sort((a, b) => {
        switch (historySort) {
            case 'NEWEST': return b.timestamp - a.timestamp;
            case 'OLDEST': return a.timestamp - b.timestamp;
            case 'HIGHEST': return b.evaluation.score - a.evaluation.score;
            case 'LOWEST': return a.evaluation.score - b.evaluation.score;
            default: return 0;
        }
    });
  };

  // --- Header Component ---
  const Header = () => (
    <div className="flex items-center justify-between mb-10 pt-4 animate-fade-in">
      <div className="flex items-center gap-4">
         {view !== 'HOME' && view !== 'SPLASH' && (
            <button 
              onClick={goBack} 
              className="p-2 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-amber-400 transition-colors"
            >
               <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
               </svg>
            </button>
         )}
         <div onClick={() => setView('HOME')} className="cursor-pointer">
           <BrandLogo size="small" />
         </div>
      </div>
      
      <div className="flex items-center gap-3">
        {level && view !== 'HOME' && view !== 'HISTORY' && (
          <span className="px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase bg-neutral-800 text-amber-500 border border-amber-500/20">
            {level.id}
          </span>
        )}
        {view === 'HOME' && (
           <button 
             onClick={loadHistory}
             className="text-sm font-medium text-neutral-400 hover:text-amber-400 transition-colors flex items-center gap-2 uppercase tracking-wide"
           >
             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
             </svg>
             History
           </button>
        )}
      </div>
    </div>
  );

  // --- VIEWS ---

  if (view === 'SPLASH') {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center animate-fade-in relative overflow-hidden">
        {/* Abstract Gold Glow Background */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-amber-500/10 blur-[120px] rounded-full pointer-events-none"></div>
        
        <div className="z-10 text-center space-y-4">
          <BrandLogo size="large" />
          <p className="text-neutral-400 text-lg tracking-widest uppercase font-light animate-slide-up" style={{ animationDelay: '200ms' }}>
            Learn English with Confidence
          </p>
        </div>
      </div>
    );
  }

  if (view === 'LIVE_CONVERSATION') {
      return (
          <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 font-sans">
            <div className="max-w-4xl mx-auto">
              <Header />
              <LiveConversation onBack={() => setView('HOME')} />
            </div>
          </div>
      )
  }

  const filteredHistory = getFilteredHistory();

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 font-sans selection:bg-amber-500/30 selection:text-amber-200">
      <div className="max-w-3xl mx-auto p-6 min-h-screen flex flex-col">
        <Header />

        {/* HOME: Level Selection */}
        {view === 'HOME' && (
          <div className="flex-1 flex flex-col">
            <div className="mb-8 text-center sm:text-left">
              <h2 className="text-3xl sm:text-4xl font-serif text-white mb-2">Choose Your Level</h2>
              <p className="text-neutral-500">Select your proficiency to start practicing.</p>
            </div>
            
            <div className="grid gap-4 flex-1 content-start">
              {LEVELS.map((lvl, index) => (
                <Card
                  key={lvl.id}
                  onClick={() => handleLevelSelect(lvl)}
                  className="group flex justify-between items-center hover:bg-neutral-800"
                >
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-amber-500 font-bold text-xl">{lvl.id}</span>
                      <h3 className="text-lg font-bold text-white group-hover:text-amber-400 transition-colors">
                        {lvl.title}
                      </h3>
                    </div>
                    <p className="text-sm text-neutral-400 leading-relaxed max-w-md">{lvl.description}</p>
                  </div>
                  <div className="w-8 h-8 rounded-full border border-neutral-700 flex items-center justify-center group-hover:border-amber-500 group-hover:text-amber-500 transition-all">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                     </svg>
                  </div>
                </Card>
              ))}
            </div>

            <div className="mt-12 animate-slide-up" style={{ animationDelay: '300ms' }}>
                <Button 
                   onClick={() => setView('LIVE_CONVERSATION')} 
                   variant="outline" 
                   fullWidth
                   className="py-5"
                >
                    <span className="text-xl mr-2">🎙️</span>
                    Start Live Conversation Mode
                </Button>
            </div>
          </div>
        )}

        {/* TOPICS: Selection */}
        {view === 'TOPICS' && (
          <div className="animate-fade-in">
             <div className="bg-neutral-900/50 border border-neutral-800 p-4 rounded-xl flex items-start gap-4 mb-8">
                <span className="text-2xl">💡</span>
                <div>
                   <p className="text-amber-500 font-bold text-xs uppercase tracking-widest mb-1">Daily Tip</p>
                   <p className="text-neutral-300 text-sm leading-relaxed italic">"{quickTip}"</p>
                </div>
             </div>

            <h2 className="text-3xl font-serif text-white mb-6">Choose a Topic</h2>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {TOPICS.map((t, index) => (
                <button
                  key={t.id}
                  onClick={() => handleTopicSelect(t)}
                  style={{ animationDelay: `${index * 50}ms` }}
                  className="animate-slide-up p-6 bg-neutral-900 border border-neutral-800 rounded-2xl hover:border-amber-500/50 hover:bg-neutral-800 hover:shadow-[0_0_20px_rgba(245,158,11,0.1)] transition-all flex flex-col items-center justify-center gap-4 group h-40"
                >
                  <span className="text-4xl filter grayscale group-hover:grayscale-0 transition-all duration-300 transform group-hover:scale-110">{t.icon}</span>
                  <span className="font-medium text-neutral-300 group-hover:text-white">{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* QUESTION: Input */}
        {view === 'QUESTION' && (
          <div className="animate-fade-in h-full flex flex-col">
            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-24 space-y-6">
                <div className="relative w-20 h-20">
                   <div className="absolute top-0 left-0 w-full h-full border-2 border-neutral-800 rounded-full"></div>
                   <div className="absolute top-0 left-0 w-full h-full border-2 border-amber-500 rounded-full border-t-transparent animate-spin"></div>
                </div>
                <p className="text-amber-500 font-medium animate-pulse tracking-wide uppercase text-sm">
                    {loadingText}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Question Card */}
                <div className="relative">
                  <span className="absolute -top-3 left-4 bg-neutral-950 px-2 text-xs font-bold tracking-widest text-amber-500 uppercase z-10">
                    Question
                  </span>
                  <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-2xl relative overflow-hidden">
                     {/* Subtle pattern */}
                     <div className="absolute top-0 right-0 p-10 opacity-5">
                        <svg width="100" height="100" viewBox="0 0 100 100" fill="white"><circle cx="50" cy="50" r="40"/></svg>
                     </div>
                     <p className="text-2xl font-serif text-white leading-relaxed relative z-10">
                       {question}
                     </p>
                  </div>
                </div>

                {/* Answer Area */}
                <div className="relative">
                    <label className="block text-xs font-bold text-neutral-500 uppercase mb-2 ml-2">Your Answer</label>
                    <div className="relative group">
                        <textarea
                            value={userAnswer}
                            onChange={(e) => setUserAnswer(e.target.value)}
                            placeholder="Type your answer..."
                            className="w-full p-6 rounded-2xl bg-neutral-900 border border-neutral-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50 transition-all min-h-[240px] resize-none text-neutral-200 text-lg leading-relaxed placeholder-neutral-700 outline-none scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent"
                        />
                         <button 
                            onClick={toggleRecording}
                            className={`absolute bottom-4 right-4 p-3 rounded-full transition-all transform hover:scale-110 active:scale-95 flex items-center justify-center shadow-lg ${
                                isRecording 
                                ? 'bg-red-500 text-white animate-pulse ring-4 ring-red-500/20' 
                                : 'bg-neutral-800 text-neutral-400 border border-neutral-700 hover:text-amber-500 hover:border-amber-500'
                            }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                        </button>
                    </div>
                </div>

                <Button 
                  onClick={handleSubmit}
                  disabled={!userAnswer.trim()}
                  fullWidth
                >
                  Check Answer with AI
                </Button>
              </div>
            )}
          </div>
        )}

        {/* EVALUATION: Results */}
        {view === 'EVALUATION' && evaluation && (
           <div className="space-y-8 pb-10 animate-fade-in">
               
               {fromHistory && (
                 <div className="bg-neutral-900 border border-neutral-800 p-2 rounded text-center text-xs text-neutral-500 uppercase tracking-widest">
                   Viewing Past Session
                 </div>
               )}

               {/* Score Section */}
               <Card className="flex items-center justify-between relative overflow-hidden !p-8">
                   <div className="relative z-10">
                       <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-1">Performance Score</p>
                       <div className="flex items-baseline gap-1">
                          <h2 className="text-6xl font-serif text-white">{evaluation.score}</h2>
                          <span className="text-xl font-medium text-neutral-500">/10</span>
                       </div>
                   </div>
                   <div className={`h-24 w-24 rounded-full flex items-center justify-center border-[3px] shadow-[0_0_30px_rgba(0,0,0,0.5)] bg-neutral-800 relative z-10 ${
                       evaluation.score >= 8 ? 'border-amber-500 text-amber-500' :
                       evaluation.score >= 5 ? 'border-blue-500 text-blue-500' :
                       'border-red-500 text-red-500'
                   }`}>
                       <span className="text-4xl">
                           {evaluation.score >= 8 ? '🏆' : evaluation.score >= 5 ? '⭐' : '📈'}
                       </span>
                   </div>
                   {/* Background Glow */}
                   <div className={`absolute top-0 right-0 w-64 h-64 opacity-10 blur-[80px] rounded-full translate-x-10 -translate-y-10 ${
                       evaluation.score >= 8 ? 'bg-amber-500' : evaluation.score >= 5 ? 'bg-blue-500' : 'bg-red-500'
                   }`}></div>
               </Card>

               {/* Corrected Answer */}
               <div className="space-y-4">
                  <h3 className="text-xl font-serif text-white">Analysis</h3>
                  
                  <Card className="border-l-4 border-l-green-500">
                     <p className="text-xs font-bold text-green-500 uppercase tracking-widest mb-3">Corrected Version</p>
                     <p className="text-lg text-white leading-relaxed">
                         {evaluation.corrected_answer}
                     </p>
                  </Card>

                  <div className="grid md:grid-cols-2 gap-4">
                      <Card className="border-l-4 border-l-red-500">
                         <p className="text-xs font-bold text-red-500 uppercase tracking-widest mb-2">Grammar Fixes</p>
                         <p className="text-sm text-neutral-300 leading-relaxed">{evaluation.grammar_correction}</p>
                      </Card>
                      <Card className="border-l-4 border-l-amber-500">
                         <p className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-2">Vocabulary</p>
                         <p className="text-sm text-neutral-300 leading-relaxed">{evaluation.vocabulary_suggestions}</p>
                      </Card>
                  </div>
               </div>

               {/* Strengths / Weaknesses */}
               <div className="grid grid-cols-2 gap-4">
                   <Card>
                       <h4 className="font-bold text-white mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                           <span className="text-green-500">●</span> Strengths
                       </h4>
                       <ul className="space-y-2">
                           {evaluation.strengths.map((s, i) => (
                               <li key={i} className="text-sm text-neutral-400 border-b border-neutral-800 pb-2 last:border-0">{s}</li>
                           ))}
                       </ul>
                   </Card>
                   <Card>
                       <h4 className="font-bold text-white mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                           <span className="text-red-500">●</span> Improvements
                       </h4>
                       <ul className="space-y-2">
                           {evaluation.weaknesses.map((w, i) => (
                               <li key={i} className="text-sm text-neutral-400 border-b border-neutral-800 pb-2 last:border-0">{w}</li>
                           ))}
                       </ul>
                   </Card>
               </div>

               {/* Professional Model Answer */}
               <div className="relative mt-8">
                   <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-transparent rounded-3xl blur-xl"></div>
                   <Card className="relative border-amber-500/30 !bg-neutral-900/80 backdrop-blur-md">
                       <div className="flex justify-between items-start mb-4">
                           <div>
                               <h3 className="text-lg font-bold text-amber-500">Professional Model Answer</h3>
                               <p className="text-xs text-amber-500/50 uppercase tracking-widest">Teacher Level</p>
                           </div>
                           <button 
                             onClick={playModelAnswer} 
                             className="p-3 rounded-full bg-amber-500 text-black hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20"
                           >
                               <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                               </svg>
                           </button>
                       </div>
                       <p className="text-lg text-neutral-200 italic leading-relaxed font-serif border-l-2 border-amber-500/50 pl-4">
                           "{evaluation.professional_model_answer}"
                       </p>
                   </Card>
               </div>

               <div className="flex flex-col gap-4 pt-4">
                   {!fromHistory && (
                     <Button onClick={handleNextQuestion} fullWidth>
                        Next Question
                     </Button>
                   )}
                   
                   <Button 
                      onClick={() => setView(fromHistory ? 'HISTORY' : 'TOPICS')}
                      variant="secondary"
                      fullWidth
                   >
                      {fromHistory ? 'Back to History' : 'Choose New Topic'}
                    </Button>
               </div>
           </div>
        )}

        {/* HISTORY VIEW */}
        {view === 'HISTORY' && (
          <div className="space-y-6 animate-fade-in pb-10">
             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-neutral-800 pb-6 gap-4">
                <div>
                   <h2 className="text-3xl font-serif text-white mb-1">Practice History</h2>
                   <p className="text-neutral-500 text-sm">Review your past sessions</p>
                </div>
                {history.length > 0 && (
                  <Button variant="danger" onClick={handleClearHistory} className="!py-2 !px-4 !text-sm">
                    Clear All
                  </Button>
                )}
             </div>

             {/* Filters */}
             {history.length > 0 && (
                 <div className="bg-neutral-900/50 p-4 rounded-xl border border-neutral-800 flex flex-col md:flex-row gap-6">
                     <div className="flex-1">
                         <label className="text-xs text-neutral-500 uppercase font-bold tracking-widest mb-3 block">Level Filter</label>
                         <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                             <button 
                                onClick={() => setHistoryFilterLevel('ALL')}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border whitespace-nowrap ${historyFilterLevel === 'ALL' ? 'bg-amber-500 text-black border-amber-500' : 'bg-transparent text-neutral-400 border-neutral-700 hover:border-amber-500/50'}`}
                             >
                                 ALL
                             </button>
                             {LEVELS.map(l => (
                                 <button 
                                    key={l.id}
                                    onClick={() => setHistoryFilterLevel(l.id)}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border whitespace-nowrap ${historyFilterLevel === l.id ? 'bg-amber-500 text-black border-amber-500' : 'bg-transparent text-neutral-400 border-neutral-700 hover:border-amber-500/50'}`}
                                 >
                                     {l.id}
                                 </button>
                             ))}
                         </div>
                     </div>
                     <div className="min-w-[200px]">
                        <label className="text-xs text-neutral-500 uppercase font-bold tracking-widest mb-3 block">Sort By</label>
                        <select 
                            value={historySort}
                            onChange={(e) => setHistorySort(e.target.value as any)}
                            className="bg-neutral-950 text-neutral-300 text-sm px-4 py-3 rounded-xl border border-neutral-800 focus:border-amber-500 focus:outline-none w-full appearance-none"
                        >
                            <option value="NEWEST">Date (Newest)</option>
                            <option value="OLDEST">Date (Oldest)</option>
                            <option value="HIGHEST">Score (Highest)</option>
                            <option value="LOWEST">Score (Lowest)</option>
                        </select>
                     </div>
                 </div>
             )}

             {filteredHistory.length === 0 ? (
               <div className="text-center py-24 bg-neutral-900 rounded-3xl border border-neutral-800 border-dashed">
                 <p className="text-6xl mb-6 opacity-20 grayscale">📜</p>
                 <h3 className="text-lg font-medium text-white">No history found</h3>
                 <p className="text-neutral-500 mt-2 text-sm">Start practicing to track your progress.</p>
               </div>
             ) : (
               <div className="grid gap-4">
                  {filteredHistory.map((item, i) => (
                    <Card
                      key={item.id}
                      onClick={() => openHistoryItem(item)}
                      className="group flex flex-col sm:flex-row gap-4 sm:items-center relative overflow-hidden"
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-neutral-800 group-hover:bg-amber-500 transition-colors"></div>
                      
                      <div className="flex-1 pl-4">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs font-bold text-amber-500 border border-amber-500/30 px-2 py-0.5 rounded uppercase tracking-wider">
                                {item.levelId}
                            </span>
                            <span className="text-xs text-neutral-500">
                                {new Date(item.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </span>
                        </div>
                         <h3 className="font-bold text-white text-lg group-hover:text-amber-500 transition-colors">{item.topicName}</h3>
                         <p className="text-sm text-neutral-400 mt-1 line-clamp-1 italic">
                            "{item.question}"
                         </p>
                      </div>
                      
                      <div className={`flex-shrink-0 w-12 h-12 rounded-full border-2 flex items-center justify-center ${
                           item.evaluation.score >= 8 ? 'border-amber-500 text-amber-500' :
                           item.evaluation.score >= 5 ? 'border-blue-500 text-blue-500' :
                           'border-red-500 text-red-500'
                        }`}>
                           <span className="font-bold">{item.evaluation.score}</span>
                      </div>
                    </Card>
                  ))}
               </div>
             )}
          </div>
        )}

      </div>
    </div>
  );
}

export default App;