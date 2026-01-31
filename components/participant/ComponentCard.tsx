
import React, { useState } from 'react';
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
  const [quantity, setQuantity] = useState(1);
  const availableQuantity = component.totalQuantity - component.reservedQuantity;

  const getStatus = () => {
    if (availableQuantity <= 0) return { text: 'OUT OF STOCK', color: 'text-red-500' };
    if (availableQuantity < 5) return { text: 'LOW STOCK', color: 'text-yellow-500' };
    return { text: 'IN STOCK', color: 'text-amber-500' };
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
    <Card className="flex flex-col justify-between h-full transition-all duration-300 border border-gray-800 hover:border-amber-500/40 bg-gray-900/40">
      <div>
        <div className="flex justify-between items-start mb-2">
            <h3 className="text-lg font-black text-white uppercase tracking-tight">{component.name}</h3>
            <span className={`text-[10px] font-black tracking-widest uppercase border border-current px-2 py-0.5 rounded ${status.color}`}>{status.text}</span>
        </div>
        <p className="text-[10px] uppercase tracking-widest text-amber-500 font-bold mb-4">{component.category}</p>
        <div className="grid grid-cols-1 gap-2 text-xs text-gray-400 mt-3 border-t border-gray-800 pt-3">
            <div>
              <p className="text-[10px] uppercase tracking-tighter text-gray-500">Available to Request</p>
              <p className="font-bold text-gray-100 text-xl">{availableQuantity}</p>
            </div>
        </div>
        {quantityInCart > 0 && (
          <div className="mt-3 bg-amber-500/10 p-2 rounded border border-amber-500/20">
            <p className="text-[10px] uppercase tracking-widest text-amber-400 font-black">In Current Cart: {quantityInCart}</p>
          </div>
        )}
      </div>
      <div className="mt-6 flex items-center space-x-2">
        <input
          type="number"
          value={quantity}
          onChange={handleQuantityChange}
          min="1"
          max={maxAllowed}
          className="w-20 px-2 py-2 bg-black border border-gray-800 rounded text-center text-white focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-30"
          disabled={maxAllowed <= 0}
        />
        <Button onClick={handleAddToCart} disabled={maxAllowed <= 0} className="flex-1 text-xs">
          Add to Request
        </Button>
      </div>
    </Card>
  );
};

export default ComponentCard;
