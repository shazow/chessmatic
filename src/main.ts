import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import './pwa';
import './analytics';

mount(App, { target: document.getElementById('app')! });
