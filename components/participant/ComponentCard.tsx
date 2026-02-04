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
    if (availableQuantity <= 0) return { text: 'Depleted', color: 'text-red-500 bg-red-500/10 border-red-500/20' };
    if (availableQuantity < 5) return { text: 'Low Stock', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' };
    return { text: 'In Stock', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
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
    <Card className="flex flex-col justify-between h-full transition-all duration-300 hover:scale-[1.01] hover:shadow-[0_0_25px_rgba(245,158,11,0.05)]">
      <div>
        <div className="flex justify-between items-start mb-4 gap-4">
            <h3 className="text-lg font-bold text-gray-100 uppercase tracking-tight leading-snug min-h-[3rem] line-clamp-2">{component.name}</h3>
            <span className={`flex-shrink-0 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest rounded border ${status.color}`}>
              {status.text}
            </span>
        </div>
        
        <div className="flex items-center gap-2 mb-6">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase bg-white/5 text-gray-400 border border-white/5">
              {component.category}
            </span>
        </div>
        
        <div className="grid grid-cols-2 gap-4 py-4 border-t border-white/5">
            <div>
              <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold mb-1">Available</p>
              <p className={`font-mono font-black text-2xl sm:text-3xl text-white leading-none ${highlightClass}`}>{availableQuantity}</p>
            </div>
             <div className="text-right">
              <p className="text-[9px] uppercase tracking-widest text-gray-500 font-bold mb-1">Total Limit</p>
              <p className="font-mono font-bold text-sm text-gray-400">{component.totalQuantity}</p>
            </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-white/5">
        {!isInCart ? (
             <Button 
                onClick={handleAddToCart} 
                disabled={maxAllowed <= 0} 
                className="w-full font-black shadow-lg"
                variant={maxAllowed <= 0 ? 'secondary' : 'primary'}
             >
                {maxAllowed <= 0 ? 'Unavailable' : 'Add to Cart'}
             </Button>
        ) : (
            <div className="flex items-center justify-between bg-black/40 border border-amber-500/30 rounded-lg p-1.5 backdrop-blur-sm">
                <button 
                    onClick={decrement}
                    className="w-10 h-9 flex items-center justify-center text-amber-500 hover:bg-amber-500/10 rounded-md transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                </button>
                <span className="font-black text-white text-lg font-mono w-8 text-center">{quantityInCart}</span>
                <button 
                    onClick={increment}
                    disabled={quantityInCart >= maxAllowed}
                    className="w-10 h-9 flex items-center justify-center text-amber-500 hover:bg-amber-500/10 rounded-md transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                </button>
            </div>
        )}
      </div>
    </Card>
  );
};

export default ComponentCard;