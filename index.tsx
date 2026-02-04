import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// The favicon is now set directly in index.html
// const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
// if (favicon) {
//   favicon.href = '/logo-new.jpg';
// }

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);