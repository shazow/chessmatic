import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import './pwa';
import { initAnalytics } from './lib/analytics';

initAnalytics();

mount(App, { target: document.getElementById('app')! });
