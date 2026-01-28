
import React, { useState } from 'react';
import { booksApi } from '../api/api';
import { Upload, FileText, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AddBook() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
       if (selected.type === 'application/epub+zip' || selected.type === 'application/pdf' || selected.name.endsWith('.epub') || selected.name.endsWith('.pdf')) {
           setFile(selected);
           setError('');
           setSuccess('');
       } else {
           setFile(null);
           setError('Please select a valid EPUB or PDF file.');
       }
    }
  };

  const overrideEvent = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    overrideEvent(e);
    const selected = e.dataTransfer.files[0];
    if (selected) {
        if (selected.type === 'application/epub+zip' || selected.type === 'application/pdf' || selected.name.endsWith('.epub') || selected.name.endsWith('.pdf')) {
            setFile(selected);
            setError('');
            setSuccess('');
        } else {
            setError('Please select a valid EPUB or PDF file.');
        }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
        setError('Please select a file to upload.');
        return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    const formData = new FormData();
    formData.append('book', file);

    try {
      const res = await booksApi.upload(formData);
      setSuccess({ message: res.data.message, bookId: res.data.bookId });
      setFile(null);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to upload book');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-black tracking-tight mb-8">Add New Book</h1>
        
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-lg">
            <div className="p-8 flex flex-col items-center justify-center min-h-[300px] border-2 border-dashed border-border m-4 rounded-xl bg-secondary/10 transition-colors hover:bg-secondary/20 hover:border-primary/50"
                 onDragOver={overrideEvent}
                 onDragEnter={overrideEvent}
                 onDrop={handleDrop}
            >
                {!file ? (
                    <>
                        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4 text-primary">
                            <Upload size={32} />
                        </div>
                        <h3 className="text-xl font-bold mb-2">Drag & Drop your book here</h3>
                        <p className="text-muted-foreground mb-6 text-sm">Supports EPUB and PDF formats</p>
                        
                        <label className="cursor-pointer">
                            <input 
                                type="file" 
                                className="hidden" 
                                accept=".epub,.pdf"
                                onChange={handleFileChange}
                            />
                            <span className="bg-primary text-primary-foreground font-bold px-6 py-3 rounded-full hover:bg-primary/90 transition-transform hover:scale-105 inline-block">
                                Browse Files
                            </span>
                        </label>
                    </>
                ) : (
                    <div className="flex flex-col items-center animate-in zoom-in duration-300">
                        <FileText size={48} className="text-primary mb-4" />
                        <p className="font-bold text-lg mb-1">{file.name}</p>
                        <p className="text-sm text-muted-foreground mb-6">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                        
                        <div className="flex gap-3">
                            <button 
                                onClick={handleSubmit}
                                disabled={loading}
                                className="bg-primary text-primary-foreground font-bold px-8 py-2 rounded-full hover:bg-primary/90 transition-all flex items-center gap-2 disabled:opacity-50"
                            >
                                {loading && <Loader size={18} className="animate-spin" />}
                                {loading ? 'Uploading...' : 'Upload Book'}
                            </button>
                            <button 
                                onClick={() => setFile(null)}
                                disabled={loading}
                                className="text-muted-foreground hover:text-destructive px-4 py-2 text-sm transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {(error || success) && (
                <div className={`p-4 mx-4 mb-4 rounded-lg flex items-center justify-between gap-3 ${error ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-500'}`}>
                    <div className="flex items-center gap-3">
                        {error ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
                        <span className="font-medium text-sm">{error || success.message || success}</span>
                    </div>
                    {success?.bookId && (
                        <button 
                            onClick={() => navigate(`/book/${success.bookId}`)}
                            className="text-xs font-bold underline hover:no-underline"
                        >
                            View Book
                        </button>
                    )}
                </div>
            )}
            
            <div className="bg-muted/30 p-4 border-t border-border text-center text-xs text-muted-foreground">
                <p>Uploaded books will be automatically scanned and added to your library.</p>
                <p className="mt-1 opacity-70">
                    To add multiple folders for bulk scanning, please manage your directories in 
                    <button onClick={() => navigate('/settings')} className="ml-1 underline hover:text-primary font-medium">Settings</button>.
                </p>
            </div>
        </div>
      </div>
    </div>
  );
}
