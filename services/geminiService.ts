import { GoogleGenAI, Type, FunctionDeclaration, Modality, Schema } from "@google/genai";
import { CEFRLevel, EvaluationResult } from "../types";

// Helper for Base64 encoding
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

// Initialize the client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// 1. Generate Question (Uses Search Grounding for freshness if 'news' or similar)
export const generateQuestion = async (
  level: CEFRLevel, 
  topic: string,
  previousQuestions: string[] = []
): Promise<string> => {
  const isCurrentEvents = topic.toLowerCase().includes('news') || topic.toLowerCase().includes('technology');
  const isBeginner = level === CEFRLevel.A1 || level === CEFRLevel.A2;
  
  // Use gemini-2.5-flash for search capabilities or general high quality
  const modelId = 'gemini-2.5-flash'; 

  let prompt = "";
  
  const avoidList = previousQuestions.length > 0 
    ? `\nIMPORTANT: Do NOT ask the following questions again (or anything very similar): \n- ${previousQuestions.join('\n- ')}` 
    : "";

  if (isBeginner) {
    // A1/A2 Specific Prompt: Simple, direct, single question
    prompt = `Generate a single, very simple English question for a beginner student (Level ${level}) about the topic: "${topic}".
    Rules:
    1. The question must be one short sentence.
    2. Use basic vocabulary.
    3. Do NOT ask multiple questions at once.
    4. Ask about basic facts, preferences, or daily routines suitable for a beginner.
    ${avoidList}
    
    Ensure the question is different from the ones listed above.
    Return ONLY the question text.`;
  } else {
    // B1-C1 Specific Prompt: Engaging, open-ended
    prompt = `Generate a single, engaging English practice question for a student at level ${level} about the topic: "${topic}".
    The question should encourage a paragraph-length response and deep thinking.
    ${isCurrentEvents ? 'Please use Google Search to find a relevant recent event or trend to base this question on.' : ''}
    ${avoidList}
    
    Ensure the question is unique, fresh, and distinct from the previous ones listed.
    Return ONLY the question text.`;
  }

  try {
    const config: any = {
       temperature: 0.7,
    };

    // Add Search tool if relevant and not beginner (beginners might not need complex news)
    if (isCurrentEvents && !isBeginner) {
        config.tools = [{ googleSearch: {} }];
    }

    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: config
    });
    
    // Check for grounding chunks to append source links if available (simplified for this return)
    let text = response.text || "Could not generate a question. Please try again.";
    
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
        // We could process links here, but for now we just return the text
    }
    
    return text;
  } catch (error) {
    console.error("Error generating question:", error);
    return isBeginner ? `What is your favorite thing about ${topic}?` : `Describe your ideal day concerning ${topic}.`;
  }
};

// 2. Evaluate Answer (Uses JSON Schema)
export const evaluateAnswer = async (
  level: CEFRLevel,
  topic: string,
  question: string,
  userAnswer: string
): Promise<EvaluationResult> => {
  const modelId = 'gemini-2.5-flash'; // Flash is good for reasoning + JSON

  const prompt = `
    You are an expert English teacher evaluating a ${level} level student.
    Topic: ${topic}
    Question: ${question}
    Student Answer: "${userAnswer}"

    Analyze the answer based strictly on CEFR level ${level}. 
    
    Feedback Rules:
    - For A1-A2: Be very encouraging. Use simple words in your feedback. Focus on basic grammar (subject-verb agreement, basic tenses).
    - For B1-B2: Focus on fluency and range.
    - For C1: Focus on nuance and sophistication.
    
    Return a JSON object with:
    - grammar_correction: String explanation
    - vocabulary_suggestions: String explanation
    - sentence_structure_fix: Rewrite in clean, correct English
    - strengths: Array of strings
    - weaknesses: Array of strings
    - score: Number (0-10)
    - corrected_answer: The full corrected text suitable for ${level}
    - professional_model_answer: A perfect, natural example answer that matches the target level (${level}). For A1/A2, keep it simple and short. For C1, make it advanced.
  `;

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      grammar_correction: { type: Type.STRING },
      vocabulary_suggestions: { type: Type.STRING },
      sentence_structure_fix: { type: Type.STRING },
      strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
      weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
      score: { type: Type.NUMBER },
      corrected_answer: { type: Type.STRING },
      professional_model_answer: { type: Type.STRING },
    },
    required: ["grammar_correction", "vocabulary_suggestions", "sentence_structure_fix", "strengths", "weaknesses", "score", "corrected_answer", "professional_model_answer"]
  };

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("No response from AI");
    return JSON.parse(jsonText) as EvaluationResult;
  } catch (error) {
    console.error("Error evaluating answer:", error);
    throw error;
  }
};

// 3. Fast Greeting / Tip (Uses Flash Lite)
export const getQuickTip = async (level: CEFRLevel): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite-preview-02-05', // Explicitly using lite
      contents: `Give a very short (one sentence) motivational tip for an English learner at level ${level}.`,
    });
    return response.text || "Keep practicing!";
  } catch (e) {
    return "Good luck with your practice!";
  }
};

// 4. Transcribe Audio (Uses Flash)
export const transcribeAudio = async (audioBlob: Blob): Promise<string> => {
  try {
    // Convert Blob to Base64
    const buffer = await audioBlob.arrayBuffer();
    const base64Data = arrayBufferToBase64(buffer);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: audioBlob.type, // e.g., 'audio/webm' or 'audio/wav'
              data: base64Data
            }
          },
          {
            text: "Transcribe this audio exactly as spoken. Return only the transcription."
          }
        ]
      }
    });

    return response.text || "";
  } catch (error) {
    console.error("Transcription error:", error);
    throw new Error("Could not transcribe audio.");
  }
};

// 5. Generate Speech (TTS)
export const generateSpeech = async (text: string): Promise<ArrayBuffer> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, // 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio data returned");

    // Decode base64 to ArrayBuffer
    const binaryString = atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  } catch (error) {
    console.error("TTS error:", error);
    throw error;
  }
};

// 6. Live API Connection (Helper)
export const connectLiveSession = async (
  onOpen: () => void,
  onMessage: (message: any) => void,
  onClose: () => void,
  onError: (e: any) => void
) => {
  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks: {
      onopen: onOpen,
      onmessage: onMessage,
      onclose: onClose,
      onerror: onError,
    },
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
      },
      systemInstruction: 'You are a helpful and friendly English tutor. Engage in casual conversation to help the user practice their speaking skills. Match your vocabulary and speed to the user\'s level if they mention it.',
    },
  });
};