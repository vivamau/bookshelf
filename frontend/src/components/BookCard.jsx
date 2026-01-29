import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';

const BookCard = ({ title, year, cover, progress, id, className, onClick }) => {
  const navigate = useNavigate();
  
  const handleClick = (e) => {
      if (onClick) onClick(e);
      else navigate(`/book/${id}`);
  };

  return (
    <div onClick={handleClick} className={`flex flex-col gap-2 group cursor-pointer animate-in fade-in zoom-in duration-500 ${className}`}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-sm bg-accent/50 border border-border group-hover:border-primary/50 transition-all shadow-md group-hover:shadow-[0_0_15px_rgba(241,24,76,0.3)]">
        <img src={cover || `https://api.dicebear.com/7.x/initials/svg?seed=${title}`} alt={title} className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105" />
        {progress > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
           <div className="bg-primary p-2 rounded-full text-primary-foreground transform scale-50 group-hover:scale-100 transition-transform duration-300">
              <BookOpen size={20} />
           </div>
        </div>
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{title}</span>
        <span className="text-xs text-muted-foreground">{year || 'N/A'}</span>
      </div>
    </div>
  );
};

export default BookCard;
