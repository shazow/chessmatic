import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import './pwa';

mount(App, { target: document.getElementById('app')! });
