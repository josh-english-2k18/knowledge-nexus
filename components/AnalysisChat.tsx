import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, Send, Bot, User, Sparkles, GripHorizontal } from 'lucide-react';
import { GraphData } from '../types';
import { chatWithGraph } from '../services/geminiService';

export interface Message {
    role: 'user' | 'model';
    text: string;
}

interface AnalysisChatProps {
    graphData: GraphData;
    messages: Message[];
    onMessagesChange: (msgs: Message[]) => void;
    onClose: () => void;
}

const AnalysisChat: React.FC<AnalysisChatProps> = ({ graphData, messages, onMessagesChange, onClose }) => {
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Window State
    const [position, setPosition] = useState({ top: 100, left: window.innerWidth - 450 });
    const [size, setSize] = useState({ width: 400, height: 600 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const dragStartRel = useRef({ x: 0, y: 0 });

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                setPosition({
                    left: e.clientX - dragStartRel.current.x,
                    top: e.clientY - dragStartRel.current.y
                });
            } else if (isResizing) {
                setSize({
                    width: Math.max(300, e.clientX - position.left),
                    height: Math.max(400, e.clientY - position.top)
                });
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            setIsResizing(false);
        };

        if (isDragging || isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing, position]);

    const startDrag = (e: React.MouseEvent) => {
        setIsDragging(true);
        dragStartRel.current = {
            x: e.clientX - position.left,
            y: e.clientY - position.top
        };
    };

    const startResize = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsResizing(true);
    };

    const handleSend = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMsg = input.trim();
        setInput('');
        const newHistory: Message[] = [...messages, { role: 'user', text: userMsg }];
        onMessagesChange(newHistory);
        setIsLoading(true);

        try {
            const response = await chatWithGraph(userMsg, graphData);
            onMessagesChange([...newHistory, { role: 'model', text: response }]);
        } catch (error) {
            console.error(error);
            onMessagesChange([...newHistory, { role: 'model', text: "I'm sorry, I encountered an error. Please try again." }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            style={{
                top: position.top,
                left: position.left,
                width: size.width,
                height: size.height
            }}
            className="fixed z-50 flex flex-col bg-slate-900/95 backdrop-blur-xl border border-cyan-500/30 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden"
        >

            {/* Draggable Header */}
            <div
                onMouseDown={startDrag}
                className="flex items-center justify-between p-4 border-b border-white/10 bg-gradient-to-r from-cyan-900/20 to-purple-900/20 cursor-move select-none"
            >
                <div className="flex items-center space-x-2 text-cyan-400">
                    <Sparkles className="w-5 h-5" />
                    <h3 className="font-bold text-sm tracking-wide">Graph Intelligence</h3>
                </div>
                <div className="flex items-center space-x-1">
                    <GripHorizontal className="w-4 h-4 text-slate-600 mr-2" />
                    <button
                        onClick={onClose}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="p-1 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
            >
                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`flex items-start space-x-3 ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}
                    >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.role === 'model' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-700 text-slate-300'
                            }`}>
                            {msg.role === 'model' ? <Bot className="w-5 h-5" /> : <User className="w-5 h-5" />}
                        </div>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'model'
                                ? 'bg-white/5 text-slate-200 border border-white/5 rounded-tl-none'
                                : 'bg-cyan-600 text-white rounded-tr-none shadow-lg'
                            }`}>
                            {msg.role === 'model' ? (
                                <div className="prose prose-invert prose-sm max-w-none">
                                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                                </div>
                            ) : (
                                msg.text
                            )}
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex items-start space-x-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0">
                            <Bot className="w-5 h-5" />
                        </div>
                        <div className="bg-white/5 border border-white/5 rounded-2xl rounded-tl-none px-4 py-3 flex space-x-1">
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                            <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                        </div>
                    </div>
                )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-white/10 bg-slate-950/50">
                <form onSubmit={handleSend} className="relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask about relationships, influencers..."
                        className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 placeholder:text-slate-600 transition-all"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-cyan-500 hover:bg-cyan-400 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </form>
            </div>

            {/* Resize Handle */}
            <div
                onMouseDown={startResize}
                className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize hover:bg-cyan-500/50 rounded-tl transition-colors"
            />
        </div>
    );
};

export default AnalysisChat;
