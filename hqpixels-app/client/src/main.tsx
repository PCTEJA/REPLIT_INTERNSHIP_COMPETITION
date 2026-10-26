import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/outfit';
import '@fontsource-variable/dm-sans';
import { App } from './App';
import './styles.css';
class ErrorBoundary extends React.Component<React.PropsWithChildren,{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?<main className="boot"><h1>Let’s get you back.</h1><p>The page couldn’t finish rendering. Your saved tasks are still on the server.</p><button onClick={()=>location.reload()}>Reload HQPIXELS</button></main>:this.props.children;}}
createRoot(document.getElementById('root')!).render(<ErrorBoundary><App/></ErrorBoundary>);
