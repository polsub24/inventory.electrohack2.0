
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
  const [quantity, setQuantity] = React.useState(1);
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

  const maxAllowed = availableQuantity;

  const handleAddToCart = () => {
    if (quantity > 0 && quantity <= maxAllowed) {
      addToCart(component.id, quantity);
      setQuantity(1);
    }
  };
  
  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = parseInt(e.target.value, 10);
    if (isNaN(value)) value = 1;
    if (value < 1) value = 1;
    if (value > maxAllowed) value = maxAllowed;
    setQuantity(value);
  }

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
            {quantityInCart > 0 && (
              <div className="bg-amber-500/10 px-3 py-1 rounded border border-amber-500/20">
                <p className="text-[10px] uppercase tracking-widest text-amber-500 font-black">In Cart: {quantityInCart}</p>
              </div>
            )}
        </div>
      </div>
      <div className="mt-8 flex items-center space-x-3">
        <div className="relative">
          <input
            type="number"
            value={quantity}
            onChange={handleQuantityChange}
            min="1"
            max={maxAllowed}
            className="w-16 sm:w-24 px-3 py-3 sm:py-4 bg-black border border-gray-800 rounded-lg text-center text-base sm:text-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-30 font-black"
            disabled={maxAllowed <= 0}
          />
        </div>
        <Button onClick={handleAddToCart} disabled={maxAllowed <= 0} className="flex-1 text-xs sm:text-sm py-3 sm:py-4 h-auto font-black">
          Add to Cart
        </Button>
      </div>
    </Card>
  );
};

export default ComponentCard;
