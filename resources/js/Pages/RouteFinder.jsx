import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Head } from '@inertiajs/react';
import MapView from '../Components/MapView';
import Sidebar from '../Components/Sidebar';

export default function RouteFinder({ nodes, edges }) {
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeRoute, setActiveRoute] = useState(null);
    const [showResults, setShowResults] = useState(false);
    const [startNode, setStartNode] = useState(null);
    const [goalNode, setGoalNode] = useState(null);
    
    // Google Maps-like layout modes and simulation states
    const [mode, setMode] = useState('search'); // 'search' or 'directions'
    const [isSimulating, setIsSimulating] = useState(false);
    const [simIndex, setSimIndex] = useState(0);

    // Geolocation / Real-Time GPS Tracking states
    const [navType, setNavType] = useState('realtime'); // 'realtime' or 'simulation'
    const [gpsCoords, setGpsCoords] = useState(null);
    const [gpsSpeed, setGpsSpeed] = useState(0);

    const handleCalculate = useCallback(async (startObj, goalObj, algorithms) => {
        setLoading(true);
        setResults([]);
        setShowResults(false);
        setIsSimulating(false);
        setSimIndex(0);

        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
            const response = await fetch('/api/calculate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': csrfToken || '',
                },
                body: JSON.stringify({
                    start: { lat: startObj.lat, lng: startObj.lng, name: startObj.name },
                    goal: { lat: goalObj.lat, lng: goalObj.lng, name: goalObj.name },
                    algorithms: algorithms,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Gagal menghitung rute');
            }

            const data = await response.json();
            setResults(data.results);
            setStartNode(data.start);
            setGoalNode(data.goal);
            setShowResults(true);

            if (data.results.length > 0) {
                setActiveRoute(0);
            }
        } catch (error) {
            console.error('Error calculating route:', error);
            alert('Error: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleReset = useCallback(() => {
        setResults([]);
        setShowResults(false);
        setActiveRoute(null);
        setStartNode(null);
        setGoalNode(null);
        setIsSimulating(false);
        setSimIndex(0);
    }, []);

    // Active path array for simulation (uses geometry if available, falls back to path)
    const activeAnimationPath = useMemo(() => {
        if (activeRoute === null || results.length === 0) return null;
        const activeResult = results[activeRoute];
        if (activeResult?.geometry && activeResult.geometry.length > 0) {
            return activeResult.geometry; // Array of [lat, lng]
        }
        return activeResult?.path?.map(p => [p.latitude, p.longitude]) || null;
    }, [activeRoute, results]);

    // Find which node index in activePath is closest to the current animation position
    const activeNodeIndex = useMemo(() => {
        if (activeRoute === null || results.length === 0) return -1;
        const activePath = results[activeRoute]?.path || [];
        const animPath = activeAnimationPath || [];
        if (!isSimulating || !animPath || animPath.length === 0 || !activePath || activePath.length === 0) {
            return -1;
        }
        const currentCoord = animPath[simIndex];
        if (!currentCoord) return -1;

        let closestIndex = 0;
        let minDistance = Infinity;

        activePath.forEach((node, idx) => {
            const dy = node.latitude - currentCoord[0];
            const dx = node.longitude - currentCoord[1];
            const dist = dy * dy + dx * dx;
            if (dist < minDistance) {
                minDistance = dist;
                closestIndex = idx;
            }
        });

        return closestIndex;
    }, [isSimulating, activeAnimationPath, simIndex, results, activeRoute]);

    // Simulation hook
    useEffect(() => {
        if (!isSimulating || !activeAnimationPath || activeAnimationPath.length === 0) {
            setSimIndex(0);
            return;
        }
        // Speed up the simulation if there are many nodes (e.g. OSRM coordinates)
        const stepDuration = activeAnimationPath.length > 10 ? 80 : 1000;

        const interval = setInterval(() => {
            setSimIndex(prev => {
                if (prev >= activeAnimationPath.length - 1) {
                    setIsSimulating(false);
                    return 0;
                }
                return prev + 1;
            });
        }, stepDuration);
        return () => clearInterval(interval);
    }, [isSimulating, activeAnimationPath]);

    // Geolocation watcher hook (watches actual GPS device coordinate and speed in real-time)
    useEffect(() => {
        if (!isSimulating || navType !== 'realtime') {
            setGpsCoords(null);
            setGpsSpeed(0);
            return;
        }

        if (!navigator.geolocation) {
            alert("Perangkat Anda tidak mendukung sensor GPS Geolocation.");
            setNavType('simulation');
            return;
        }

        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, speed } = position.coords;
                setGpsCoords([latitude, longitude]);
                // speed is in m/s, convert to km/h
                if (speed !== null && speed !== undefined) {
                    setGpsSpeed(Math.round(speed * 3.6));
                } else {
                    setGpsSpeed(0);
                }
            },
            (error) => {
                console.error("GPS WatchPosition error:", error);
                alert("Gagal mengakses GPS: " + error.message + ". Beralih ke Mode Simulasi.");
                setNavType('simulation');
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
        );

        return () => {
            if (watchId) navigator.geolocation.clearWatch(watchId);
        };
    }, [isSimulating, navType]);

    // Auto-reroute if the user deviates from the path during real-time GPS navigation
    useEffect(() => {
        if (!isSimulating || navType !== 'realtime' || !gpsCoords || !goalNode || loading) return;

        const activeResult = results[activeRoute];
        if (!activeResult) return;

        const pathCoords = activeResult.geometry && activeResult.geometry.length > 0
            ? activeResult.geometry
            : activeResult.path?.map(p => [p.latitude, p.longitude]) || [];

        if (pathCoords.length === 0) return;

        // Find minimum distance in meters to any point on the route polyline
        let minDistanceMeters = Infinity;
        pathCoords.forEach(coord => {
            const latDiff = (coord[0] - gpsCoords[0]) * 111320;
            const lngDiff = (coord[1] - gpsCoords[1]) * 40075000 * Math.cos(coord[0] * Math.PI / 180) / 360;
            const dist = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
            if (dist < minDistanceMeters) {
                minDistanceMeters = dist;
            }
        });

        // If user deviates by more than 50 meters, automatically recalculate path from new GPS location to goal
        if (minDistanceMeters > 50) {
            console.log(`User deviated by ${minDistanceMeters.toFixed(1)} meters. Recalculating route using optimal algorithm...`);
            
            const startObj = {
                name: "Posisi Saya",
                latitude: gpsCoords[0],
                longitude: gpsCoords[1],
                lat: gpsCoords[0],
                lng: gpsCoords[1]
            };
            
            const goalObj = {
                name: goalNode.name,
                latitude: goalNode.latitude !== undefined ? goalNode.latitude : goalNode.lat,
                longitude: goalNode.longitude !== undefined ? goalNode.longitude : goalNode.lng,
                lat: goalNode.latitude !== undefined ? goalNode.latitude : goalNode.lat,
                lng: goalNode.longitude !== undefined ? goalNode.longitude : goalNode.lng
            };

            // Recalculate using active algorithms (always defaults to optimal routing)
            handleCalculate(startObj, goalObj, ['astar']);
        }
    }, [gpsCoords, isSimulating, navType, goalNode, activeRoute, results, loading]);

    // Build edge lines for the base graph visualization
    const graphEdges = useMemo(() => {
        return edges.map(edge => ({
            from: [edge.from_node.latitude, edge.from_node.longitude],
            to: [edge.to_node.latitude, edge.to_node.longitude],
            road: edge.road_name,
            distance: edge.distance_km,
        }));
    }, [edges]);

    return (
        <>
            <Head title="Route Finder - Google Maps Style" />

            <div style={{
                display: 'flex',
                height: '100vh',
                width: '100vw',
                overflow: 'hidden',
                position: 'relative',
            }}>
                {/* Left Sidebar */}
                <div style={{
                    width: isSimulating ? 0 : 400,
                    minWidth: isSimulating ? 0 : 400,
                    overflow: 'hidden',
                    display: isSimulating ? 'none' : 'block',
                    flexShrink: 0
                }}>
                    <Sidebar
                        nodes={nodes}
                        onCalculate={handleCalculate}
                        onReset={handleReset}
                        loading={loading}
                        results={results}
                        showResults={showResults}
                        activeRoute={activeRoute}
                        onSelectRoute={setActiveRoute}
                        // Dual mode search states
                        mode={mode}
                        setMode={setMode}
                        startNode={startNode}
                        setStartNode={setStartNode}
                        goalNode={goalNode}
                        setGoalNode={setGoalNode}
                        // Simulation states
                        isSimulating={isSimulating}
                        setIsSimulating={setIsSimulating}
                        simIndex={simIndex}
                        setSimIndex={setSimIndex}
                        activeAnimationPath={activeAnimationPath}
                        activeNodeIndex={activeNodeIndex}
                    />
                </div>

                {/* Map Area */}
                <div style={{ flex: 1, position: 'relative' }}>
                    <MapView
                        nodes={nodes}
                        graphEdges={graphEdges}
                        results={results}
                        activeRoute={activeRoute}
                        startNode={startNode}
                        goalNode={goalNode}
                        onSelectRoute={setActiveRoute}
                        // Navigation animation parameters
                        isSimulating={isSimulating}
                        setIsSimulating={setIsSimulating}
                        simIndex={simIndex}
                        activePath={activeAnimationPath}
                        activeNodeIndex={activeNodeIndex}
                        // GPS Geolocation parameters
                        gpsCoords={gpsCoords}
                        gpsSpeed={gpsSpeed}
                        navType={navType}
                        setNavType={setNavType}
                    />
                </div>
            </div>
        </>
    );
}
