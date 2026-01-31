
import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer }) => {
  if (!isOpen) return null;

  return (
    <div 
        className="fixed inset-0 bg-black/90 backdrop-blur-sm flex justify-center items-center z-50 transition-opacity duration-300"
        onClick={onClose}
    >
        <div 
            className="bg-gray-950 border border-amber-900/50 rounded-lg shadow-[0_0_50px_rgba(212,175,55,0.1)] w-full max-w-lg m-4 transform transition-all duration-300 scale-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex justify-between items-center p-5 border-b border-gray-900">
                <h3 className="text-xs font-black text-amber-500 uppercase tracking-[0.2em]">{title}</h3>
                <button onClick={onClose} className="text-gray-600 hover:text-amber-500 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div className="p-8">
                {children}
            </div>
            {footer && (
                <div className="p-5 bg-black/40 border-t border-gray-900 flex justify-end space-x-3">
                    {footer}
                </div>
            )}
        </div>
    </div>
  );
};

export default Modal;
