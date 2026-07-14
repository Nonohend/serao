import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// leaflet.css est chargé dynamiquement par TrackingMap (page Livraison uniquement)
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
