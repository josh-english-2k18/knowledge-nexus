import React, { useCallback, useState } from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';

interface UploadZoneProps {
  onFileLoaded: (content: string, fileName: string) => void;
  isLoading: boolean;
}

const UploadZone: React.FC<UploadZoneProps> = ({ onFileLoaded, isLoading }) => {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const processFile = (file: File) => {
    if (!file.name.endsWith('.md') && !file.name.endsWith('.txt') && !file.name.endsWith('.markdown')) {
      setError("Please upload a Markdown (.md) or Text (.txt) file.");
      return;
    }
    
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        onFileLoaded(text, file.name);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, [onFileLoaded]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto p-4 z-10 relative">
      <div 
        className={`
          relative overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-300 ease-out
          flex flex-col items-center justify-center p-12 text-center cursor-pointer group
          ${dragActive 
            ? 'border-cyan-400 bg-cyan-950/30 scale-[1.02] shadow-[0_0_30px_rgba(34,211,238,0.2)]' 
            : 'border-slate-700 bg-slate-900/50 hover:border-slate-500 hover:bg-slate-800/50'
          }
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => document.getElementById('file-upload')?.click()}
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/5 to-purple-500/5 pointer-events-none" />
        
        <div className={`mb-6 p-4 rounded-full bg-slate-800 ring-1 ring-slate-700 group-hover:ring-cyan-500/50 transition-all duration-500 ${isLoading ? 'animate-pulse' : ''}`}>
          {isLoading ? (
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Upload className="w-8 h-8 text-cyan-400 group-hover:scale-110 transition-transform duration-300" />
          )}
        </div>

        <h3 className="text-2xl font-semibold text-slate-100 mb-2">
          {isLoading ? 'Analyzing Structure...' : 'Drop Markdown File'}
        </h3>
        <p className="text-slate-400 mb-6 max-w-xs mx-auto">
          {isLoading 
            ? 'Extracting entities and relationships using Gemini AI models...' 
            : 'Upload a markdown file to generate an interactive 3D knowledge graph.'}
        </p>

        {error && (
          <div className="flex items-center space-x-2 text-red-400 bg-red-950/30 px-4 py-2 rounded-lg text-sm mb-4">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        <button 
          className="px-6 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isLoading}
        >
          Select File
        </button>

        <input 
          id="file-upload" 
          type="file" 
          className="hidden" 
          accept=".md,.txt,.markdown"
          onChange={handleChange}
          disabled={isLoading}
        />
        
        <div className="mt-8 flex items-center justify-center space-x-6 text-xs text-slate-500">
          <div className="flex items-center space-x-1">
            <FileText className="w-3 h-3" />
            <span>.MD Supported</span>
          </div>
          <div className="flex items-center space-x-1">
             <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
            <span>Secure Processing</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UploadZone;