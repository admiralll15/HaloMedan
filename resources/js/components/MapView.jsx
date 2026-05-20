import React, { useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { X, Car, ArrowUp, ArrowUpRight, ArrowUpLeft, MapPin } from 'lucide-react';


const ROUTE_COLORS = { 'UCS': '#059669', 'A*': '#2563eb', 'Hill Climbing': '#d97706' };
const ROUTE_DASH = { 'UCS': null, 'A*': '12 6', 'Hill Climbing': '4 8' };
const DEFAULT_CENTER = [3.59, 98.67];
const DEFAULT_ZOOM = 12;
const ETA_SPEED_KMH = 30; // Neutral city driving speed for ETA

function ChangeView({ center, zoom, bounds, isSimulating }) {
    const map = useMap();
    const wasSimulatingRef = React.useRef(false);

    useEffect(() => {
        if (isSimulating && center) {
            if (!wasSimulatingRef.current) {
                // Just started simulating: zoom in smoothly once
                map.setView(center, 16, { animate: true, duration: 0.5 });
                wasSimulatingRef.current = true;
            } else {
                // Ongoing simulation: pan instantly to keep up with coordinates
                map.setView(center, map.getZoom(), { animate: false });
            }
        } else {
            wasSimulatingRef.current = false;
            if (bounds?.length > 0) {
                try { map.fitBounds(bounds, { padding: [50, 50], animate: true, duration: 0.8 }); } catch {}
            } else if (center) {
                map.setView(center, zoom || map.getZoom(), { animate: true, duration: 0.8 });
            }
        }
    }, [center, zoom, bounds, isSimulating]);
    return null;
}

export default function MapView({ 
    nodes, graphEdges, results, activeRoute, startNode, goalNode, onSelectRoute, 
    isSimulating, setIsSimulating, simIndex, activePath, activeNodeIndex, simFinished,
    setSimFinished, setSimIndex 
}) {
    const routePolylines = useMemo(() => {
        if (!results?.length) return [];
        return results.map((r, i) => ({
            positions: r.geometry?.length > 0 ? r.geometry : r.path.map(p => [p.latitude, p.longitude]),
            color: ROUTE_COLORS[r.algorithm] || '#6b7280',
            dash: ROUTE_DASH[r.algorithm] || null,
            algorithm: r.algorithm, active: activeRoute === i, index: i,
        }));
    }, [results, activeRoute]);

    const activeResult = useMemo(() => {
        if (activeRoute === null || !results?.length) return null;
        return results[activeRoute] || null;
    }, [results, activeRoute]);

    const exploredCircleMarkers = useMemo(() => {
        if (!activeResult || !activeResult.explored_nodes) return [];
        return activeResult.explored_nodes;
    }, [activeResult]);

    const pathCircleMarkers = useMemo(() => {
        if (!activeResult || !activeResult.path) return [];
        return activeResult.path;
    }, [activeResult]);

    const activeColor = useMemo(() => {
        if (!activeResult) return '#64748b';
        return ROUTE_COLORS[activeResult.algorithm] || '#64748b';
    }, [activeResult]);

    const currentSimPosition = useMemo(() => {
        if (!isSimulating && !simFinished) return null;
        return activePath?.[simIndex] || null;
    }, [isSimulating, simFinished, activePath, simIndex]);

    const carAngle = useMemo(() => {
        if ((!isSimulating && !simFinished) || !activePath?.length) return 0;
        const cur = activePath[simIndex], nxt = activePath[Math.min(simIndex + 1, activePath.length - 1)];
        if (!cur || !nxt) return 0;
        const dy = nxt[0] - cur[0], dx = nxt[1] - cur[1];
        if (Math.abs(dy) < 1e-6 && Math.abs(dx) < 1e-6) return 0;
        return Math.atan2(dx, dy) * (180 / Math.PI);
    }, [isSimulating, simFinished, activePath, simIndex]);

    // Dynamic speed calculations
    const currentSpeed = useMemo(() => {
        if (simFinished || !isSimulating) return 0;
        if (!activePath || activePath.length <= 1) return 0;

        const cur = activePath[simIndex];
        const next = activePath[Math.min(simIndex + 1, activePath.length - 1)];
        if (!cur || !next) return 0;

        const R = 6371;
        const dLat = (next[0] - cur[0]) * Math.PI / 180;
        const dLon = (next[1] - cur[1]) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(cur[0]*Math.PI/180)*Math.cos(next[0]*Math.PI/180)*Math.sin(dLon/2)**2;
        const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        const stepMs = activePath.length > 10 ? 80 : 1000;
        const hours = stepMs / 3600000;

        let calculatedSpeed = Math.round(distKm / hours);
        if (isNaN(calculatedSpeed) || calculatedSpeed <= 0) calculatedSpeed = 0;

        if (simIndex < 3) return Math.min(35, 10 + simIndex * 10);
        if (simIndex >= activePath.length - 3) {
            const stepsFromEnd = activePath.length - 1 - simIndex;
            return Math.max(0, stepsFromEnd * 12);
        }

        if (calculatedSpeed < 15) return 18 + (simIndex % 5);
        if (calculatedSpeed > 60) return 48 + (simIndex % 7);
        return calculatedSpeed;
    }, [isSimulating, simFinished, activePath, simIndex]);

    const startCoords = useMemo(() => {
        if (!startNode) return null;
        const lat = startNode.latitude ?? startNode.lat, lng = startNode.longitude ?? startNode.lng;
        return (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) ? [lat, lng] : null;
    }, [startNode]);

    const goalCoords = useMemo(() => {
        if (!goalNode) return null;
        const lat = goalNode.latitude ?? goalNode.lat, lng = goalNode.longitude ?? goalNode.lng;
        return (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) ? [lat, lng] : null;
    }, [goalNode]);

    const mapCenter = useMemo(() => {
        if (currentSimPosition && isSimulating) return currentSimPosition;
        if (!activePath?.length) return startCoords || goalCoords || null;
        return null;
    }, [currentSimPosition, isSimulating, activePath, startCoords, goalCoords]);

    const activeBounds = useMemo(() => {
        if (isSimulating || !activePath?.length) return null;
        return activePath;
    }, [isSimulating, activePath]);

    const carIcon = useMemo(() => {
        if (typeof window === 'undefined') return null;
        return L.divIcon({
            html: `
                <div style="
                    width: 36px; height: 36px;
                    background: #2563eb;
                    border: 3px solid #ffffff;
                    border-radius: 50%;
                    box-shadow: 0 4px 10px rgba(37,99,235,0.4);
                    display: flex; align-items: center; justify-content: center;
                    transform: rotate(${carAngle}deg);
                    transition: transform 0.15s ease-out;
                ">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="18 15 12 9 6 15"/>
                    </svg>
                </div>
            `,
            className: 'custom-car-marker',
            iconSize: [36, 36],
            iconAnchor: [18, 18],
        });
    }, [carAngle]);

    // HUD data for navigation overlay
    const hudData = useMemo(() => {
        if (!isSimulating && !simFinished) return null;
        const r = results?.[activeRoute];
        if (!r) return null;
        const totalDist = r.total_distance_km || 1;
        const totalDurMin = Math.max(1, Math.round((totalDist / ETA_SPEED_KMH) * 60));
        const progress = activePath?.length > 0 ? simIndex / (activePath.length - 1) : 0;
        const remMin = simFinished ? 0 : Math.max(1, Math.ceil((1 - progress) * totalDurMin));
        const remKm = simFinished ? '0.0' : ((1 - progress) * totalDist).toFixed(1);
        const now = new Date(); now.setMinutes(now.getMinutes() + remMin);
        const arrival = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        // Next street from path
        const nextStreet = r.path && activeNodeIndex >= 0 && activeNodeIndex + 1 < r.path.length
            ? r.path[activeNodeIndex + 1].name.split(',')[0]
            : goalNode?.name?.split(',')[0] || 'Tujuan';
        // Current street
        const currentStreet = r.path && activeNodeIndex >= 0 && activeNodeIndex < r.path.length
            ? r.path[activeNodeIndex].name.split(',')[0]
            : startNode?.name?.split(',')[0] || '';
        // Direction arrow based on angle change
        let arrow = <ArrowUp size={24} color="#fff" />;
        if (simFinished || simIndex >= (activePath?.length || 0) - 2) { 
            arrow = <MapPin size={24} color="#ef4444" fill="#ef4444" />; 
        }
        else if (activePath?.[simIndex + 1] && activePath?.[simIndex + 3]) {
            const n = activePath[simIndex + 1], f = activePath[simIndex + 3];
            const futAngle = Math.atan2(f[1] - n[1], f[0] - n[0]) * (180 / Math.PI);
            let diff = futAngle - carAngle; if (diff > 180) diff -= 360; if (diff < -180) diff += 360;
            if (diff > 30) arrow = <ArrowUpRight size={24} color="#fff" />; 
            else if (diff < -30) arrow = <ArrowUpLeft size={24} color="#fff" />;
        }
        return { totalDist, totalDurMin, remMin, remKm, arrival, nextStreet, currentStreet, arrow, algorithm: r.algorithm, progress };
    }, [isSimulating, simFinished, results, activeRoute, activePath, simIndex, activeNodeIndex, goalNode, startNode, carAngle]);

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <style>{`
                .clickable-polyline { cursor: pointer !important; }
                .custom-car-marker { background: none !important; border: none !important; }
                @keyframes pulse-dot {
                    0% { transform: scale(0.9); opacity: 0.6; }
                    50% { transform: scale(1.1); opacity: 1; }
                    100% { transform: scale(0.9); opacity: 0.6; }
                }
            `}</style>

            <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} style={{ width: '100%', height: '100%' }} zoomControl={!isSimulating}>
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {(mapCenter || activeBounds) && <ChangeView center={mapCenter} zoom={currentSimPosition ? 16 : 12} bounds={activeBounds} isSimulating={isSimulating} />}

                {graphEdges.map((edge, i) => <Polyline key={`edge-${i}`} positions={[edge.from, edge.to]} pathOptions={{ color: '#cbd5e1', weight: 1.5, opacity: 0.5 }} />)}

                {routePolylines.filter(r => !r.active).map(r => (
                    <Polyline key={`route-${r.index}`} positions={r.positions} eventHandlers={{ click: () => onSelectRoute?.(r.index) }}
                        pathOptions={{ color: r.color, weight: 6, opacity: 0.35, dashArray: r.dash, className: 'clickable-polyline' }} />
                ))}
                {routePolylines.filter(r => r.active).map(r => (
                    <Polyline key={`route-active-${r.index}`} positions={r.positions} eventHandlers={{ click: () => onSelectRoute?.(r.index) }}
                        pathOptions={{ color: r.color, weight: 8, opacity: 0.95, dashArray: r.dash, className: 'clickable-polyline' }} />
                ))}

                {nodes.map(node => {
                    const isStart = startCoords && Math.abs(node.latitude - startCoords[0]) < 0.0001 && Math.abs(node.longitude - startCoords[1]) < 0.0001;
                    const isGoal = goalCoords && Math.abs(node.latitude - goalCoords[0]) < 0.0001 && Math.abs(node.longitude - goalCoords[1]) < 0.0001;
                    
                    // Cek apakah node landmark ini sedang dievaluasi oleh algoritma
                    const isExplored = !isSimulating && exploredCircleMarkers.some(exp => 
                        Math.abs(node.latitude - exp.latitude) < 0.0001 && 
                        Math.abs(node.longitude - exp.longitude) < 0.0001
                    );

                    // Jika sedang dievaluasi dan bukan start/goal, sembunyikan marker landmark statisnya
                    // agar tidak tumpang tindih (tertimpa) dengan marker kuning evaluasi
                    if (isExplored && !isStart && !isGoal) return null;

                    return (
                        <CircleMarker key={`node-${node.id}`} center={[node.latitude, node.longitude]} radius={isStart || isGoal ? 8 : 6}
                            pathOptions={{ fillColor: isStart ? '#059669' : isGoal ? '#ef4444' : '#6366f1', fillOpacity: isStart || isGoal ? 1 : 0.85, color: '#fff', weight: isStart || isGoal ? 3 : 2 }}>
                            <Tooltip direction="top" offset={[0, -8]} className="node-tooltip" permanent={isStart || isGoal}>
                                {isStart && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#059669', marginRight: 6 }}></span>}
                                {isGoal && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ef4444', marginRight: 6 }}></span>}
                                {node.name}
                            </Tooltip>
                        </CircleMarker>
                    );
                })}

                {startCoords && !nodes.some(n => Math.abs(n.latitude - startCoords[0]) < 0.0001 && Math.abs(n.longitude - startCoords[1]) < 0.0001) && (
                    <CircleMarker center={startCoords} radius={8} pathOptions={{ fillColor: '#059669', fillOpacity: 1, color: '#fff', weight: 3 }}>
                        <Tooltip direction="top" offset={[0, -8]} permanent>
                            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#059669', marginRight: 6 }}></span>
                            {startNode?.name?.split(',')[0] || 'Titik Awal'}
                        </Tooltip>
                    </CircleMarker>
                )}
                {goalCoords && !nodes.some(n => Math.abs(n.latitude - goalCoords[0]) < 0.0001 && Math.abs(n.longitude - goalCoords[1]) < 0.0001) && (
                    <CircleMarker center={goalCoords} radius={8} pathOptions={{ fillColor: '#ef4444', fillOpacity: 1, color: '#fff', weight: 3 }}>
                        <Tooltip direction="top" offset={[0, -8]} permanent>
                            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ef4444', marginRight: 6 }}></span>
                            {goalNode?.name?.split(',')[0] || 'Tujuan'}
                        </Tooltip>
                    </CircleMarker>
                )}

                {/* Visualisasi Node Ter-eksplorasi (Explored Nodes) - Diletakkan paling bawah agar digambar di atas garis rute */}
                {!isSimulating && exploredCircleMarkers.map((node, idx) => {
                    const isStart = startCoords && Math.abs(node.latitude - startCoords[0]) < 0.0001 && Math.abs(node.longitude - startCoords[1]) < 0.0001;
                    const isGoal = goalCoords && Math.abs(node.latitude - goalCoords[0]) < 0.0001 && Math.abs(node.longitude - goalCoords[1]) < 0.0001;
                    if (isStart || isGoal) return null;

                    return (
                        <CircleMarker 
                            key={`explored-${node.id || idx}`} 
                            center={[node.latitude, node.longitude]} 
                            radius={6}
                            pathOptions={{ 
                                fillColor: '#ffff00', // Neon Yellow (Sangat Kontras)
                                fillOpacity: 1, 
                                color: activeColor, // Border warna algoritma
                                weight: 2.5, 
                                opacity: 1 
                            }}
                        >
                            <Tooltip direction="top" offset={[0, -6]}>
                                <span>Titik Dievaluasi ({activeResult?.algorithm}): Ke-{idx + 1}</span>
                            </Tooltip>
                        </CircleMarker>
                    );
                })}

                {/* Visualisasi Node Rute Akhir (Path Nodes) - Di atas rute aktif */}
                {!isSimulating && pathCircleMarkers.map((node, idx) => {
                    const isStart = startCoords && Math.abs(node.latitude - startCoords[0]) < 0.0001 && Math.abs(node.longitude - startCoords[1]) < 0.0001;
                    const isGoal = goalCoords && Math.abs(node.latitude - goalCoords[0]) < 0.0001 && Math.abs(node.longitude - goalCoords[1]) < 0.0001;
                    if (isStart || isGoal) return null;

                    return (
                        <CircleMarker 
                            key={`path-node-${node.id || idx}`} 
                            center={[node.latitude, node.longitude]} 
                            radius={5}
                            pathOptions={{ 
                                fillColor: '#ffffff', // Putih (Sangat Kontras di atas garis hijau/biru)
                                fillOpacity: 1, 
                                color: activeColor, // Border warna algoritma
                                weight: 2.5, 
                                opacity: 1 
                            }}
                        >
                            <Tooltip direction="top" offset={[0, -5]}>
                                <span>Rute Akhir: {node.name || 'Jalan'}</span>
                            </Tooltip>
                        </CircleMarker>
                    );
                })}

                {currentSimPosition && carIcon && <Marker position={currentSimPosition} icon={carIcon} />}
            </MapContainer>

            {/* ====== GOOGLE MAPS-STYLE NAVIGATION HUD ====== */}
            {(isSimulating || simFinished) && hudData && (
                <>
                    {/* Top Direction Banner — like the green banner in screenshot */}
                    <div style={{
                        position: 'absolute', top: 16, left: 16, right: 16, zIndex: 1000,
                        background: simFinished ? '#059669' : '#065f46',
                        borderRadius: 14, padding: '14px 18px',
                        boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
                        display: 'flex', alignItems: 'center', gap: 14,
                        color: '#fff', fontFamily: 'Inter, sans-serif',
                    }}>
                        <div style={{
                            fontSize: 30, minWidth: 48, height: 48, borderRadius: 12,
                            background: 'rgba(255,255,255,0.15)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            {hudData.arrow}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                {simFinished ? 'Simulasi Selesai' : `menuju`}
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>
                                {simFinished ? `Tiba di ${goalNode?.name?.split(',')[0]}` : hudData.nextStreet}
                            </div>
                        </div>
                        <div style={{
                            padding: '4px 10px', borderRadius: 8,
                            background: 'rgba(255,255,255,0.15)',
                            fontSize: 10, fontWeight: 700, textAlign: 'center',
                            lineHeight: 1.4, color: 'rgba(255,255,255,0.9)',
                        }}>
                            {hudData.algorithm}
                        </div>
                    </div>

                    {/* Current Street Label — near car position, like the blue label in screenshot */}
                    {isSimulating && hudData.currentStreet && (
                        <div style={{
                            position: 'absolute', bottom: 90, left: '50%', transform: 'translateX(-50%)',
                            zIndex: 1000, background: '#2563eb', color: '#fff',
                            padding: '6px 16px', borderRadius: 8,
                            fontSize: 12, fontWeight: 700, fontFamily: 'Inter, sans-serif',
                            boxShadow: '0 2px 8px rgba(37,99,235,0.4)',
                            whiteSpace: 'nowrap', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                            {hudData.currentStreet}
                        </div>
                    )}

                    {/* Speedometer — bottom left, like screenshot */}
                    <div style={{
                        position: 'absolute', bottom: 90, left: 16, zIndex: 1000,
                        width: 56, height: 56, borderRadius: '50%',
                        background: '#fff', border: '3px solid #334155',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'Inter, sans-serif',
                    }}>
                        <span style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>
                            {currentSpeed}
                        </span>
                        <span style={{ fontSize: 7, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginTop: 1 }}>km/h</span>
                    </div>

                    {/* Bottom Control Bar — ETA, distance, time, close button */}
                    <div style={{
                        position: 'absolute', bottom: 16, left: 16, right: 16, zIndex: 1000,
                        background: '#fff', borderRadius: 20, padding: '14px 20px',
                        boxShadow: '0 6px 24px rgba(0,0,0,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        fontFamily: 'Inter, sans-serif', border: '1px solid rgba(0,0,0,0.06)',
                    }}>
                        {/* Close button */}
                        <button 
                            onClick={() => {
                                setIsSimulating(false);
                                if (setSimFinished) setSimFinished(false);
                                if (setSimIndex) setSimIndex(0);
                            }} 
                            style={{
                                width: 42, height: 42, borderRadius: '50%',
                                border: '1px solid #e2e8f0', background: '#fff',
                                color: '#64748b', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)', flexShrink: 0,
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.borderColor = '#94a3b8'}
                            onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
                        >
                            <X size={18} />
                        </button>

                        {/* Center: ETA info */}
                        <div style={{ textAlign: 'center', flex: 1, padding: '0 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                <span style={{ fontSize: 22, fontWeight: 900, color: simFinished ? '#059669' : '#065f46' }}>
                                    {simFinished ? 'Tiba' : `${hudData.remMin} min`}
                                </span>
                                {!simFinished && (
                                    <span style={{
                                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                                        background: '#10b981', marginLeft: 6,
                                        animation: 'pulse-dot 1.2s infinite ease-in-out',
                                    }} />
                                )}
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500, marginTop: 2 }}>
                                {simFinished
                                    ? `Total ${hudData.totalDist} km • ${hudData.totalDurMin} min`
                                    : `${hudData.remKm} km • ${hudData.arrival}`
                                }
                            </div>
                        </div>

                        {/* Right: Simulation badge/button */}
                        <button 
                            onClick={() => {
                                setIsSimulating(false);
                                if (setSimFinished) setSimFinished(false);
                                if (setSimIndex) setSimIndex(0);
                            }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '8px 14px', borderRadius: 12,
                                border: `1.5px solid ${simFinished ? '#059669' : '#10b981'}`,
                                background: simFinished ? '#ecfdf5' : '#f0fdf4',
                                color: '#065f46', fontSize: 11, fontWeight: 700, flexShrink: 0,
                                cursor: 'pointer', outline: 'none', transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            <Car size={14} color={simFinished ? '#059669' : '#10b981'} />
                            <span>{simFinished ? 'Selesai' : 'Simulasi'}</span>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
