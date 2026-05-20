import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Head } from '@inertiajs/react';
import MapView from '../Components/MapView';
import Sidebar from '../Components/Sidebar';

const SS_KEY = 'halomedan_';
function loadSession(key, fallback = null) {
    try { const raw = sessionStorage.getItem(SS_KEY + key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}
function saveSession(key, value) {
    try { sessionStorage.setItem(SS_KEY + key, JSON.stringify(value)); } catch {}
}

export default function RouteFinder({ nodes, edges }) {
    const [results, setResults] = useState(() => loadSession('results', []));
    const [loading, setLoading] = useState(false);
    const [activeRoute, setActiveRoute] = useState(() => loadSession('activeRoute', null));
    const [showResults, setShowResults] = useState(() => loadSession('showResults', false));
    const [startNode, setStartNode] = useState(() => loadSession('startNode', null));
    const [goalNode, setGoalNode] = useState(() => loadSession('goalNode', null));
    const [mode, setMode] = useState(() => loadSession('mode', 'search'));

    const [isSimulating, setIsSimulating] = useState(false);
    const [simIndex, setSimIndex] = useState(0);
    const [simFinished, setSimFinished] = useState(false);

    const [gpsDetecting, setGpsDetecting] = useState(false);
    const [userGpsLocation, setUserGpsLocation] = useState(() => loadSession('userGpsLocation', null));
    const gpsDetectedRef = useRef(false);

    useEffect(() => { saveSession('results', results); }, [results]);
    useEffect(() => { saveSession('activeRoute', activeRoute); }, [activeRoute]);
    useEffect(() => { saveSession('showResults', showResults); }, [showResults]);
    useEffect(() => { saveSession('startNode', startNode); }, [startNode]);
    useEffect(() => { saveSession('goalNode', goalNode); }, [goalNode]);
    useEffect(() => { saveSession('mode', mode); }, [mode]);
    useEffect(() => { saveSession('userGpsLocation', userGpsLocation); }, [userGpsLocation]);

    useEffect(() => {
        if (gpsDetectedRef.current) return;
        if (userGpsLocation) {
            if (!startNode) setStartNode(userGpsLocation);
            gpsDetectedRef.current = true;
            return;
        }
        gpsDetectedRef.current = true;
        if (!navigator.geolocation) return;
        setGpsDetecting(true);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                let placeName = 'Lokasi Saya';
                try {
                    const res = await fetch(`/api/reverse-geocode?lat=${latitude}&lng=${longitude}`);
                    if (res.ok) { const data = await res.json(); if (data.name) placeName = data.name; }
                } catch {}
                const gpsNode = { name: placeName, lat: latitude, lng: longitude, source: 'gps' };
                setUserGpsLocation(gpsNode);
                if (!startNode) setStartNode(gpsNode);
                setGpsDetecting(false);
            },
            () => { setGpsDetecting(false); },
            { enableHighAccuracy: true, maximumAge: 60000, timeout: 8000 }
        );
    }, []);

    const handleCalculate = useCallback(async (startObj, goalObj, algorithms) => {
        setLoading(true); setResults([]); setShowResults(false);
        setIsSimulating(false); setSimIndex(0); setSimFinished(false);
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
            const response = await fetch('/api/calculate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken || '' },
                body: JSON.stringify({
                    start: { lat: startObj.lat, lng: startObj.lng, name: startObj.name },
                    goal: { lat: goalObj.lat, lng: goalObj.lng, name: goalObj.name },
                    algorithms,
                }),
            });
            if (!response.ok) { const e = await response.json(); throw new Error(e.message || 'Gagal menghitung rute'); }
            const data = await response.json();
            setResults(data.results); setStartNode(data.start); setGoalNode(data.goal);
            setShowResults(true);
            if (data.results.length > 0) setActiveRoute(0);
        } catch (error) { console.error(error); alert('Error: ' + error.message); }
        finally { setLoading(false); }
    }, []);

    const handleReset = useCallback(() => {
        setResults([]); setShowResults(false); setActiveRoute(null);
        if (userGpsLocation) setStartNode(userGpsLocation);
        else setStartNode(null);
        setGoalNode(null); setIsSimulating(false); setSimIndex(0); setSimFinished(false);
    }, [userGpsLocation]);

    const activeAnimationPath = useMemo(() => {
        if (activeRoute === null || results.length === 0) return null;
        const r = results[activeRoute];
        if (r?.geometry?.length > 0) return r.geometry;
        return r?.path?.map(p => [p.latitude, p.longitude]) || null;
    }, [activeRoute, results]);

    const activeNodeIndex = useMemo(() => {
        if (activeRoute === null || results.length === 0) return -1;
        const activePath = results[activeRoute]?.path || [];
        const animPath = activeAnimationPath || [];
        if (!animPath.length || !activePath.length) return simFinished ? activePath.length - 1 : -1;
        if (simFinished) return activePath.length - 1;
        if (!isSimulating && simIndex === 0) return -1;
        const currentCoord = animPath[simIndex];
        if (!currentCoord) return -1;
        let closestIndex = 0, minDist = Infinity;
        activePath.forEach((node, idx) => {
            const d = (node.latitude - currentCoord[0]) ** 2 + (node.longitude - currentCoord[1]) ** 2;
            if (d < minDist) { minDist = d; closestIndex = idx; }
        });
        return closestIndex;
    }, [isSimulating, simFinished, activeAnimationPath, simIndex, results, activeRoute]);

    useEffect(() => {
        if (!isSimulating || !activeAnimationPath?.length) return;
        const dur = activeAnimationPath.length > 10 ? 80 : 1000;
        const iv = setInterval(() => {
            setSimIndex(prev => {
                if (prev >= activeAnimationPath.length - 1) { setIsSimulating(false); setSimFinished(true); return prev; }
                return prev + 1;
            });
        }, dur);
        return () => clearInterval(iv);
    }, [isSimulating, activeAnimationPath]);

    const graphEdges = useMemo(() => edges.map(e => ({
        from: [e.from_node.latitude, e.from_node.longitude],
        to: [e.to_node.latitude, e.to_node.longitude],
        road: e.road_name, distance: e.distance_km,
    })), [edges]);

    return (
        <>
            <Head title="Route Finder - HaloMedan" />
            <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', position: 'relative' }}>
                {/* Sidebar — ALWAYS visible, shows progress during simulation */}
                <div style={{ width: 400, minWidth: 400, overflow: 'hidden', flexShrink: 0 }}>
                    <Sidebar
                        nodes={nodes} onCalculate={handleCalculate} onReset={handleReset}
                        loading={loading} results={results} showResults={showResults}
                        activeRoute={activeRoute} onSelectRoute={setActiveRoute}
                        mode={mode} setMode={setMode}
                        startNode={startNode} setStartNode={setStartNode}
                        goalNode={goalNode} setGoalNode={setGoalNode}
                        isSimulating={isSimulating} setIsSimulating={setIsSimulating}
                        simIndex={simIndex} setSimIndex={setSimIndex}
                        simFinished={simFinished} setSimFinished={setSimFinished}
                        activeAnimationPath={activeAnimationPath} activeNodeIndex={activeNodeIndex}
                        gpsDetecting={gpsDetecting} userGpsLocation={userGpsLocation}
                    />
                </div>
                <div style={{ flex: 1, position: 'relative' }}>
                    <MapView
                        nodes={nodes} graphEdges={graphEdges} results={results}
                        activeRoute={activeRoute} startNode={startNode} goalNode={goalNode}
                        onSelectRoute={setActiveRoute}
                        isSimulating={isSimulating} setIsSimulating={setIsSimulating}
                        simIndex={simIndex} activePath={activeAnimationPath}
                        activeNodeIndex={activeNodeIndex} simFinished={simFinished}
                    />
                </div>
            </div>
        </>
    );
}
