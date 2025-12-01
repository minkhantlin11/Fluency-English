import React, { useEffect, useRef, useState, useCallback } from 'react';
import { connectLiveSession } from '../services/geminiService';
import { LiveServerMessage } from '@google/genai';

// Helper to encode PCM data
function encodePCM(bytes: Uint8Array) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Helper to decode audio data from API
function decodeAudio(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

const LiveConversation: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
    const [volume, setVolume] = useState(0);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const sessionRef = useRef<any>(null); // Holds the LiveSession object
    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const nextStartTimeRef = useRef<number>(0);
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

    // Visualization Loop
    const drawVisualizer = useCallback(() => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        const width = canvasRef.current.width;
        const height = canvasRef.current.height;
        
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#4f46e5'; // Indigo-600
        
        // Simple visualizer based on volume
        const barHeight = Math.min(height, volume * 5 * height);
        const x = (width - 20) / 2;
        const y = (height - barHeight) / 2;
        
        ctx.beginPath();
        ctx.roundRect(x, y, 20, barHeight, 10);
        ctx.fill();

        requestAnimationFrame(drawVisualizer);
    }, [volume]);

    useEffect(() => {
        const animationId = requestAnimationFrame(drawVisualizer);
        return () => cancelAnimationFrame(animationId);
    }, [drawVisualizer]);

    const startSession = async () => {
        setStatus('connecting');
        try {
            // Audio Contexts
            const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            audioContextRef.current = outputCtx;

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const inputNode = inputCtx.createMediaStreamSource(stream);
            const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);

            inputNode.connect(scriptProcessor);
            scriptProcessor.connect(inputCtx.destination);

            // Connect to Gemini Live
            sessionPromiseRef.current = connectLiveSession(
                () => { // On Open
                    setStatus('connected');
                    // Setup Audio Input Processing
                    scriptProcessor.onaudioprocess = (e) => {
                        const inputData = e.inputBuffer.getChannelData(0);
                        
                        // Calculate volume for visualizer
                        let sum = 0;
                        for(let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
                        setVolume(Math.sqrt(sum / inputData.length));

                        // Create PCM Blob
                        const l = inputData.length;
                        const int16 = new Int16Array(l);
                        for (let i = 0; i < l; i++) {
                            int16[i] = inputData[i] * 32768;
                        }
                        
                        const pcmData = encodePCM(new Uint8Array(int16.buffer));
                        
                        // Send to API
                        sessionPromiseRef.current?.then(session => {
                            session.sendRealtimeInput({
                                media: {
                                    mimeType: 'audio/pcm;rate=16000',
                                    data: pcmData
                                }
                            });
                        });
                    };
                },
                async (message: LiveServerMessage) => { // On Message
                    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    if (base64Audio) {
                        const audioData = decodeAudio(base64Audio);
                        
                        // Decode PCM to AudioBuffer
                        const dataInt16 = new Int16Array(audioData.buffer);
                        const frameCount = dataInt16.length;
                        const buffer = outputCtx.createBuffer(1, frameCount, 24000);
                        const channelData = buffer.getChannelData(0);
                        for(let i=0; i<frameCount; i++) {
                            channelData[i] = dataInt16[i] / 32768.0;
                        }

                        // Play Audio
                        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                        const source = outputCtx.createBufferSource();
                        source.buffer = buffer;
                        source.connect(outputCtx.destination);
                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += buffer.duration;
                        
                        sourcesRef.current.add(source);
                        source.onended = () => sourcesRef.current.delete(source);
                    }
                    
                    if (message.serverContent?.interrupted) {
                        sourcesRef.current.forEach(s => s.stop());
                        sourcesRef.current.clear();
                        nextStartTimeRef.current = 0;
                    }
                },
                () => { // On Close
                   setStatus('idle');
                },
                (err) => { // On Error
                   console.error(err);
                   setStatus('error');
                }
            );

            // Wait for connection to resolve to set sessionRef if needed (mostly handled via promise ref)
            sessionRef.current = await sessionPromiseRef.current;

        } catch (e) {
            console.error("Failed to start session", e);
            setStatus('error');
        }
    };

    const stopSession = () => {
        if (sessionRef.current) {
            // There isn't a direct close method exposed on the session object easily in the example,
            // but closing the stream and context stops input.
            // The library manages websocket closure usually.
            // Assuming we can just teardown local resources.
        }
        
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
        }
        setStatus('idle');
    };

    // Clean up on unmount
    useEffect(() => {
        return () => {
            stopSession();
        };
    }, []);

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] bg-indigo-900 text-white rounded-2xl p-8 relative overflow-hidden">
             {/* Background glow */}
            <div className={`absolute w-64 h-64 bg-indigo-500 rounded-full blur-3xl opacity-20 transition-all duration-300 ${status === 'connected' ? 'scale-125' : 'scale-100'}`}></div>

            <h2 className="text-2xl font-bold mb-8 z-10">Live Conversation Practice</h2>

            <canvas ref={canvasRef} width={200} height={100} className="mb-8 z-10" />

            <div className="z-10 flex gap-4">
                {status === 'idle' || status === 'error' ? (
                    <button 
                        onClick={startSession}
                        className="bg-white text-indigo-900 px-8 py-4 rounded-full font-bold shadow-lg hover:bg-indigo-50 transition-all flex items-center gap-2"
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        Start Conversation
                    </button>
                ) : (
                    <button 
                        onClick={stopSession}
                        className="bg-red-500 text-white px-8 py-4 rounded-full font-bold shadow-lg hover:bg-red-600 transition-all"
                    >
                        End Call
                    </button>
                )}
            </div>

            {status === 'error' && <p className="text-red-300 mt-4">Connection failed. Please try again.</p>}
            {status === 'connecting' && <p className="text-indigo-200 mt-4 animate-pulse">Connecting to Gemini Live...</p>}
            
            <button onClick={onBack} className="absolute top-4 right-4 text-indigo-200 hover:text-white">
                Close
            </button>
        </div>
    );
};

export default LiveConversation;
