import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './app/providers/AuthProvider';
import { App } from './app/App';
import './styles/tokens.css';
import './styles/global.css';
import './styles/layout.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<BrowserRouter><AuthProvider><App/></AuthProvider></BrowserRouter>);
