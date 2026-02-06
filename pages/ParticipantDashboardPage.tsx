import React, { useState } from 'react';
import ComponentList from '../components/participant/ComponentList';
import Cart from '../components/participant/Cart';
import RequestHistory from '../components/participant/RequestHistory';
import { CartItem } from '../types';

const ParticipantDashboardPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'store' | 'requests'>('store');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const addToCart = (componentId: string, quantity: number) => {
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.componentId === componentId);
      if (existingItem) {
        return prevCart.map(item =>
          item.componentId === componentId ? { ...item, quantity: item.quantity + quantity } : item
        );
      }
      return [...prevCart, { componentId, quantity }];
    });
  };

  const updateCartItemQuantity = (componentId: string, newQuantity: number) => {
    setCart(prevCart => {
      if (newQuantity <= 0) {
        return prevCart.filter(item => item.componentId !== componentId);
      }
      return prevCart.map(item =>
        item.componentId === componentId ? { ...item, quantity: newQuantity } : item
      );
    });
  };

  const clearCart = () => {
    setCart([]);
    setIsCartOpen(false);
  };

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const TabButton: React.FC<{ tab: 'store' | 'requests', label: string }> = ({ tab, label }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex-1 py-4 px-4 sm:px-8 font-black text-xs sm:text-sm uppercase tracking-widest transition-all duration-200 focus:outline-none border-b-2 ${activeTab === tab
          ? 'border-amber-500 text-amber-500 bg-amber-500/5'
          : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/30'
        }`}
    >
      {label}
    </button>
  );

  return (
    <div className="relative pb-24 sm:pb-12">
      <div className="mb-6 sm:mb-10">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl sm:text-4xl font-black text-amber-500 uppercase italic tracking-tighter">Team Dashboard</h1>
        </div>
        <div className="border-b border-gray-800">
          <nav className="flex" aria-label="Tabs">
            <TabButton tab="store" label="Resources" />
            <TabButton tab="requests" label="My Requests" />
          </nav>
        </div>
      </div>

      <div className="mt-6 sm:mt-10">
        {activeTab === 'store' && (
          <div className="fade-in">
            <ComponentList cart={cart} addToCart={addToCart} updateCartItemQuantity={updateCartItemQuantity} />
          </div>
        )}
        {activeTab === 'requests' && (
          <div className="fade-in max-w-4xl mx-auto">
            <RequestHistory />
          </div>
        )}
      </div>

      {activeTab === 'store' && (
        <div className="fixed bottom-8 right-8 z-40">
          <button
            onClick={() => setIsCartOpen(true)}
            className="bg-amber-500 text-black rounded-full p-5 sm:p-6 shadow-[0_0_30px_rgba(245,158,11,0.4)] hover:bg-amber-400 focus:outline-none active:scale-90 transition-all transform"
            aria-label="Open Cart"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 sm:h-9 sm:w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            {cartItemCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-white text-black font-black text-xs rounded-full h-6 w-6 sm:h-7 sm:w-7 flex items-center justify-center border-2 border-amber-500">{cartItemCount}</span>
            )}
          </button>
        </div>
      )}

      <Cart
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        updateCartItemQuantity={updateCartItemQuantity}
        clearCart={clearCart}
      />
    </div>
  );
};

export default ParticipantDashboardPage;