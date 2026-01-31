
import React, { useState } from 'react';
import { CartItem } from '../../types';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import Button from '../common/Button';
import Spinner from '../common/Spinner';

interface CartProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  updateCartItemQuantity: (componentId: string, newQuantity: number) => void;
  clearCart: () => void;
}

const Cart: React.FC<CartProps> = ({ isOpen, onClose, cart, updateCartItemQuantity, clearCart }) => {
  const { getComponentById, submitRequest } = useInventory();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleQuantityChange = (componentId: string, change: number) => {
    const item = cart.find(i => i.componentId === componentId);
    if (item) {
      updateCartItemQuantity(componentId, item.quantity + change);
    }
  };

  const handleRemoveItem = (componentId: string) => {
    updateCartItemQuantity(componentId, 0);
  };
  
  const handleSubmitRequest = async () => {
    if (!user || cart.length === 0) return;
    setIsLoading(true);
    try {
      await submitRequest(user.id, cart);
      setIsSubmitted(true);
      setTimeout(() => {
        clearCart();
        setIsSubmitted(false);
        onClose();
      }, 2000);
    } catch (error) {
      console.error("Failed to submit request", error);
    } finally {
      setIsLoading(false);
    }
  };

  const cartTotalItems = cart.reduce((total, item) => total + item.quantity, 0);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex justify-end" onClick={onClose}>
      <div 
        className="w-full max-w-md bg-gray-950 border-l border-amber-900/30 shadow-2xl h-full flex flex-col transform transition-transform duration-300 translate-x-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-6 border-b border-gray-900">
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-amber-500 italic">Request Cart</h2>
          <button onClick={onClose} className="p-1 rounded-full text-gray-500 hover:text-amber-500 transition-colors">
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        
        <div className="flex-grow overflow-y-auto p-6">
          {isSubmitted ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="p-4 rounded-full bg-green-500/10 border border-green-500/30 mb-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">Request Transmitted</h3>
                <p className="text-gray-500 text-xs mt-2 uppercase tracking-widest">Awaiting admin review and approval</p>
            </div>
          ) : cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full opacity-30">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p className="text-xs uppercase tracking-[0.2em] font-black">Your cart is empty</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {cart.map(item => {
                const component = getComponentById(item.componentId);
                if (!component) return null;
                const available = component.totalQuantity - component.reservedQuantity;
                const max = available;
                return (
                  <li key={item.componentId} className="flex items-center justify-between bg-black/40 border border-gray-900 p-4 rounded-lg">
                    <div className="flex-1 mr-4">
                      <p className="font-bold text-gray-100 text-sm uppercase">{component.name}</p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">{component.category}</p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <button onClick={() => updateCartItemQuantity(item.componentId, Math.max(1, item.quantity - 1))} className="w-8 h-8 rounded border border-gray-800 flex items-center justify-center hover:bg-gray-800 transition-colors">-</button>
                      <span className="font-mono font-bold text-amber-500 w-6 text-center">{item.quantity}</span>
                      <button onClick={() => updateCartItemQuantity(item.componentId, Math.min(max, item.quantity + 1))} disabled={item.quantity >= max} className="w-8 h-8 rounded border border-gray-800 flex items-center justify-center hover:bg-gray-800 transition-colors disabled:opacity-30">+</button>
                      <button onClick={() => handleRemoveItem(item.componentId)} className="text-gray-600 hover:text-red-500 transition-colors ml-2">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!isSubmitted && cart.length > 0 && (
          <div className="p-6 border-t border-gray-900 bg-black/20">
            <div className="flex justify-between items-center mb-6">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Allocation Total</span>
              <span className="text-2xl font-black text-amber-500">{cartTotalItems} Units</span>
            </div>
            <Button className="w-full py-4 bg-amber-600 hover:bg-amber-500 text-black font-black uppercase tracking-widest shadow-lg shadow-amber-600/10" onClick={handleSubmitRequest} disabled={isLoading || cart.length === 0}>
              {isLoading ? <Spinner /> : 'Transmit Official Request'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Cart;
