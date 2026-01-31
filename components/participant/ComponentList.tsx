
import React from 'react';
import { useInventory } from '../../context/InventoryContext';
import ComponentCard from './ComponentCard';
import { Component, CartItem } from '../../types';

interface ComponentListProps {
  cart: CartItem[];
  addToCart: (componentId: string, quantity: number) => void;
  updateCartItemQuantity: (componentId: string, newQuantity: number) => void;
}

const ComponentList: React.FC<ComponentListProps> = ({ cart, addToCart, updateCartItemQuantity }) => {
  const { components } = useInventory();

  if (!components.length) {
    return <p>No components available at the moment.</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {components.map((component: Component) => (
        <ComponentCard
          key={component.id}
          component={component}
          cart={cart}
          addToCart={addToCart}
          updateCartItemQuantity={updateCartItemQuantity}
        />
      ))}
    </div>
  );
};

export default ComponentList;
