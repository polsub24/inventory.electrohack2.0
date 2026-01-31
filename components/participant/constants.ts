
import { Component, ComponentCategory, Team, Request, RequestStatus } from '../../types';

export const MOCK_COMPONENTS: Component[] = [
  { id: 'c1', name: 'Arduino Uno', category: ComponentCategory.Modules, totalQuantity: 20, reservedQuantity: 5 },
  { id: 'c2', name: 'ESP32', category: ComponentCategory.Modules, totalQuantity: 15, reservedQuantity: 2 },
  { id: 'c3', name: 'DHT11 Temp/Humidity Sensor', category: ComponentCategory.Sensors, totalQuantity: 50, reservedQuantity: 10 },
  { id: 'c4', name: 'Ultrasonic Sensor HC-SR04', category: ComponentCategory.Sensors, totalQuantity: 30, reservedQuantity: 0 },
  { id: 'c5', name: '10k Ohm Resistor', category: ComponentCategory.Passives, totalQuantity: 1000, reservedQuantity: 200 },
  { id: 'c6', name: 'LED (Red)', category: ComponentCategory.Passives, totalQuantity: 500, reservedQuantity: 150 },
  { id: 'c7', name: 'L298N Motor Driver', category: ComponentCategory.ICs, totalQuantity: 25, reservedQuantity: 8 },
  { id: 'c8', name: '74HC595 Shift Register', category: ComponentCategory.ICs, totalQuantity: 40, reservedQuantity: 0 },
  { id: 'c9', name: 'Servo Motor SG90', category: ComponentCategory.Modules, totalQuantity: 3, reservedQuantity: 1 },
  { id: 'c10', name: 'Potentiometer', category: ComponentCategory.Passives, totalQuantity: 10, reservedQuantity: 0 },
];

export const MOCK_TEAMS: Team[] = [
    { id: 't1', teamName: 'RoboTitans', leaderName: 'Alice', registrationNumber: 'REG001'},
    { id: 't2', teamName: 'CircuitBreakers', leaderName: 'Bob', registrationNumber: 'REG002'},
    { id: 't3', teamName: 'CodeCrushers', leaderName: 'Charlie', registrationNumber: 'REG003'},
];

export const MOCK_REQUESTS: Request[] = [
  {
    id: 'r1',
    teamId: 't1',
    team: MOCK_TEAMS[0],
    status: RequestStatus.Pending,
    items: [
      { componentId: 'c1', quantity: 2, component: MOCK_COMPONENTS[0] },
      { componentId: 'c3', quantity: 5, component: MOCK_COMPONENTS[2] },
    ],
    timestamp: new Date(Date.now() - 3600 * 1000),
  },
  {
    id: 'r2',
    teamId: 't2',
    team: MOCK_TEAMS[1],
    status: RequestStatus.Approved,
    items: [
      { componentId: 'c2', quantity: 1, component: MOCK_COMPONENTS[1] },
      { componentId: 'c7', quantity: 1, component: MOCK_COMPONENTS[6] },
    ],
    timestamp: new Date(Date.now() - 2 * 3600 * 1000),
  },
  {
    id: 'r3',
    teamId: 't3',
    team: MOCK_TEAMS[2],
    status: RequestStatus.Collected,
    items: [
      { componentId: 'c4', quantity: 2, component: MOCK_COMPONENTS[3] },
    ],
    timestamp: new Date(Date.now() - 5 * 3600 * 1000),
  },
];
