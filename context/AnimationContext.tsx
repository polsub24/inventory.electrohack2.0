import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import SparkAnimation from '../components/common/SparkAnimation';

interface Spark {
  id: number;
  x: number;
  y: number;
}

interface AnimationContextType {
  triggerSpark: (x: number, y: number) => void;
}

const AnimationContext = createContext<AnimationContextType | undefined>(undefined);

export const AnimationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [sparks, setSparks] = useState<Spark[]>([]);

  const triggerSpark = useCallback((x: number, y: number) => {
    const newSpark: Spark = { id: Date.now() + Math.random(), x, y };
    setSparks(currentSparks => [...currentSparks, newSpark]);
  }, []);

  const removeSpark = useCallback((id: number) => {
    setSparks(currentSparks => currentSparks.filter(spark => spark.id !== id));
  }, []);

  return (
    <AnimationContext.Provider value={{ triggerSpark }}>
      {children}
      {sparks.map(spark => (
        <SparkAnimation
          key={spark.id}
          x={spark.x}
          y={spark.y}
          onComplete={() => removeSpark(spark.id)}
        />
      ))}
    </AnimationContext.Provider>
  );
};

export const useAnimation = () => {
  const context = useContext(AnimationContext);
  if (context === undefined) {
    throw new Error('useAnimation must be used within an AnimationProvider');
  }
  return context;
};
