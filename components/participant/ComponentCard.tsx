import React from 'react';
import { Component, CartItem } from '../../types';
import Card from '../common/Card';
import Button from '../common/Button';

interface ComponentCardProps {
  component: Component;
  cart: CartItem[];
  addToCart: (componentId: string, quantity: number) => void;
  updateCartItemQuantity: (componentId: string, newQuantity: number) => void;
}

const ComponentCard: React.FC<ComponentCardProps> = ({ component, cart, addToCart, updateCartItemQuantity }) => {
  const availableQuantity = component.totalQuantity - component.reservedQuantity;
  const [highlightClass, setHighlightClass] = React.useState('');
  const prevAvailableQuantityRef = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    const prevQty = prevAvailableQuantityRef.current;
    if (prevQty !== undefined && prevQty !== availableQuantity) {
        setHighlightClass('highlight-pulse');
        const timer = setTimeout(() => setHighlightClass(''), 1000);
        return () => clearTimeout(timer);
    }
    prevAvailableQuantityRef.current = availableQuantity;
  }, [availableQuantity]);

  const getStatus = () => {
    if (availableQuantity <= 0) return { text: 'OUT OF STOCK', color: 'text-red-500 border-red-900/40' };
    if (availableQuantity < 5) return { text: 'LOW STOCK', color: 'text-amber-400 border-amber-900/40' };
    return { text: 'AVAILABLE', color: 'text-green-500 border-green-900/40' };
  };

  const status = getStatus();
  
  const cartItem = cart.find(item => item.componentId === component.id);
  const quantityInCart = cartItem ? cartItem.quantity : 0;
  const isInCart = quantityInCart > 0;

  const maxAllowed = availableQuantity;

  const handleAddToCart = () => {
    if (maxAllowed > 0) {
      addToCart(component.id, 1);
    }
  };

  const increment = () => {
      if (quantityInCart < maxAllowed) {
          updateCartItemQuantity(component.id, quantityInCart + 1);
      }
  };

  const decrement = () => {
      updateCartItemQuantity(component.id, quantityInCart - 1);
  };

  return (
    <Card className="flex flex-col justify-between h-full transition-all duration-300 border border-gray-800/60 hover:border-amber-500/50 bg-gray-900/40 p-5 sm:p-7">
      <div>
        <div className="flex justify-between items-start mb-3">
            <h3 className="text-base sm:text-xl font-black text-white uppercase tracking-tight line-clamp-2 leading-tight">{component.name}</h3>
        </div>
        <div className="flex items-center space-x-2 mb-6">
            <span className="text-[9px] font-black tracking-widest uppercase text-gray-500">{component.category}</span>
            <span className={`text-[9px] font-black tracking-widest uppercase border px-2 py-0.5 rounded ${status.color}`}>{status.text}</span>
        </div>
        
        <div className="flex items-end justify-between border-t border-gray-800/40 pt-5">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-gray-600 font-black mb-1">Stock Left</p>
              <p className={`font-black text-white text-2xl sm:text-4xl leading-none ${highlightClass}`}>{availableQuantity}</p>
            </div>
        </div>
      </div>
      <div className="mt-8">
        {!isInCart ? (
             <Button onClick={handleAddToCart} disabled={maxAllowed <= 0} className="w-full text-xs sm:text-sm py-3 sm:py-4 h-auto font-black shadow-lg shadow-amber-900/10">
                Add to Cart
             </Button>
        ) : (
            <div className="flex items-center justify-between bg-black border border-amber-500/50 rounded-md p-1">
                <button 
                    onClick={decrement}
                    className="w-12 h-10 flex items-center justify-center text-amber-500 hover:bg-amber-500/10 rounded transition-colors text-lg font-bold"
                >
                    −
                </button>
                <span className="font-black text-white text-lg">{quantityInCart}</span>
                <button 
                    onClick={increment}
                    disabled={quantityInCart >= maxAllowed}
                    className="w-12 h-10 flex items-center justify-center text-amber-500 hover:bg-amber-500/10 rounded transition-colors text-lg font-bold disabled:opacity-30 disabled:hover:bg-transparent"
                >
                    +
                </button>
            </div>
        )}
      </div>
    </Card>
  );
};

export default ComponentCard;