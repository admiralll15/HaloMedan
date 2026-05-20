import React, { useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';

const ROUTE_COLORS = {
    'UCS': '#059669',
    'A*': '#2563eb',
    'Hill Climbing': '#d97706',
};

const ROUTE_DASH = {
    'UCS': null,
    'A*': '12 6',
    'Hill Climbing': '4 8',
};

// Center of the map: Medan City center
const DEFAULT_CENTER = [3.59, 98.67];
const DEFAULT_ZOOM = 12;

const floatingBtnStyle = {
    width: 48,
    height: 48,
    borderRadius: '50%',
    backgroundColor: '#fff',
    border: 'none',
    boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    cursor: 'pointer',
    transition: 'all 0.2s',
};

// Component to dynamically pan and center map on position changes
function ChangeView({ center, zoom, bounds }) {
    const map = useMap();
    useEffect(() => {
        if (bounds && bounds.length > 0) {
            try {
                map.fitBounds(bounds, { padding: [50, 50], animate: true, duration: 0.8 });
            } catch (e) {
                console.error("Error fitting bounds:", e);
            }
        } else if (center) {
            map.setView(center, zoom || map.getZoom(), { animate: true, duration: 0.8 });
        }
    }, [center, zoom, bounds]);
    return null;
}

export default function MapView({ nodes, graphEdges, results, activeRoute, startNode, goalNode, onSelectRoute, isSimulating, setIsSimulating, simIndex, activePath, activeNodeIndex, gpsCoords, gpsSpeed, navType, setNavType }) {
    // Build polyline coordinates for each result
    const routePolylines = useMemo(() => {
        if (!results || results.length === 0) return [];
        return results.map((r, i) => ({
            positions: r.geometry && r.geometry.length > 0 
                ? r.geometry 
                : r.path.map(p => [p.latitude, p.longitude]),
            color: ROUTE_COLORS[r.algorithm] || '#6b7280',
            dash: ROUTE_DASH[r.algorithm] || null,
            algorithm: r.algorithm,
            active: activeRoute === i,
            index: i,
        }));
    }, [results, activeRoute]);

    // Current simulation position (activePath is already mapped as [lat, lng] array)
    const currentSimPosition = useMemo(() => {
        if (!isSimulating) return null;
        if (navType === 'realtime' && gpsCoords) {
            return gpsCoords;
        }
        if (activePath && activePath.length > 0) {
            const coord = activePath[simIndex];
            return coord || null;
        }
        return null;
    }, [isSimulating, navType, gpsCoords, activePath, simIndex]);

    // Compute angle of the car based on current and next coordinate
    const carAngle = useMemo(() => {
        if (!isSimulating) return 0;
        
        // If in realtime mode, compute angle based on current and previous GPS coordinates if available,
        // or fallback to the closest segment angle.
        if (navType === 'realtime' && gpsCoords) {
            if (!activePath || activePath.length === 0) return 0;
            // Find closest segment to calculate heading direction
            const closestIndex = activeNodeIndex >= 0 ? activeNodeIndex : 0;
            const currentCoord = activePath[closestIndex];
            const nextCoord = activePath[closestIndex + 1] || activePath[closestIndex];
            if (currentCoord && nextCoord) {
                const dy = nextCoord[0] - currentCoord[0];
                const dx = nextCoord[1] - currentCoord[1];
                return Math.atan2(dx, dy) * (180 / Math.PI);
            }
            return 0;
        }

        if (!activePath || activePath.length === 0) return 0;
        const currentCoord = activePath[simIndex];
        const nextCoord = activePath[simIndex + 1] || activePath[simIndex];
        if (!currentCoord || !nextCoord) return 0;
        
        const dy = nextCoord[0] - currentCoord[0]; // Lat (Y)
        const dx = nextCoord[1] - currentCoord[1]; // Lng (X)
        if (Math.abs(dy) < 0.000001 && Math.abs(dx) < 0.000001) return 0;
        
        // atan2(dx, dy) returns angle in radians clockwise from North (upwards)
        const radians = Math.atan2(dx, dy);
        const degrees = radians * (180 / Math.PI);
        return degrees;
    }, [isSimulating, navType, gpsCoords, activePath, simIndex, activeNodeIndex]);

    // Normalize start/goal coordinates supporting both latitude/longitude and lat/lng keys
    const startCoords = useMemo(() => {
        if (!startNode) return null;
        const lat = startNode.latitude !== undefined ? startNode.latitude : startNode.lat;
        const lng = startNode.longitude !== undefined ? startNode.longitude : startNode.lng;
        return (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) ? [lat, lng] : null;
    }, [startNode]);

    const goalCoords = useMemo(() => {
        if (!goalNode) return null;
        const lat = goalNode.latitude !== undefined ? goalNode.latitude : goalNode.lat;
        const lng = goalNode.longitude !== undefined ? goalNode.longitude : goalNode.lng;
        return (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) ? [lat, lng] : null;
    }, [goalNode]);

    // Center of map to focus on during simulation
    const mapCenter = useMemo(() => {
        if (currentSimPosition) return currentSimPosition;
        if (!activePath || activePath.length === 0) {
            return startCoords || goalCoords || null;
        }
        return null;
    }, [currentSimPosition, activePath, startCoords, goalCoords]);

    // Active route bounds (only when not simulating, so we fit the whole route)
    const activeBounds = useMemo(() => {
        if (isSimulating || !activePath || activePath.length === 0) return null;
        return activePath;
    }, [isSimulating, activePath]);

    // Custom moving car marker icon (emoji rotated to point in the direction of the road!)
    const carIcon = useMemo(() => {
        if (typeof window === 'undefined') return null;
        return L.divIcon({
            html: `<div style="
                font-size: 28px;
                transform: rotate(${carAngle}deg);
                transition: transform 0.15s ease-out;
                width: 44px;
                height: 44px;
                display: flex;
                align-items: center;
                justify-content: center;
            ">🚘</div>`,
            className: 'custom-car-marker',
            iconSize: [44, 44],
            iconAnchor: [22, 22],
        });
    }, [carAngle]);

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            {/* Inject pulse animation styles directly */}
            <style>{`
                @keyframes map-car-pulse {
                    0% { box-shadow: 0 0 0 0 rgba(37,99,235,0.7); }
                    70% { box-shadow: 0 0 0 12px rgba(37,99,235,0); }
                    100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); }
                }
                .clickable-polyline {
                    cursor: pointer !important;
                }
            `}</style>

            <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} style={{ width: '100%', height: '100%' }} zoomControl={true}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* Pan/Zoom on active center or bounds */}
                {(mapCenter || activeBounds) && (
                    <ChangeView 
                        center={mapCenter} 
                        zoom={currentSimPosition ? 15 : 12} 
                        bounds={activeBounds} 
                    />
                )}

                {/* Base graph edges (light gray) */}
                {graphEdges.map((edge, i) => (
                    <Polyline
                        key={`edge-${i}`}
                        positions={[edge.from, edge.to]}
                        pathOptions={{ color: '#cbd5e1', weight: 1.5, opacity: 0.5 }}
                    />
                ))}

                {/* All city nodes */}
                {nodes.map(node => {
                    const isStart = startCoords && Math.abs(node.latitude - startCoords[0]) < 0.0001 && Math.abs(node.longitude - startCoords[1]) < 0.0001;
                    const isGoal = goalCoords && Math.abs(node.latitude - goalCoords[0]) < 0.0001 && Math.abs(node.longitude - goalCoords[1]) < 0.0001;

                    return (
                        <CircleMarker
                            key={`node-${node.id}`}
                            center={[node.latitude, node.longitude]}
                            radius={isStart || isGoal ? 8 : 5}
                            pathOptions={{
                                fillColor: isStart ? '#059669' : isGoal ? '#ef4444' : '#64748b',
                                fillOpacity: isStart || isGoal ? 1 : 0.7,
                                color: '#fff',
                                weight: isStart || isGoal ? 3 : 2,
                            }}
                        >
                            <Tooltip
                                direction="top"
                                offset={[0, -8]}
                                className="node-tooltip"
                                permanent={isStart || isGoal}
                            >
                                {isStart && '🟢 '}{isGoal && '🔴 '}{node.name}
                            </Tooltip>
                        </CircleMarker>
                    );
                })}

                {/* Draw dedicated dynamic start marker if it doesn't overlap with db nodes */}
                {startCoords && !nodes.some(node => Math.abs(node.latitude - startCoords[0]) < 0.0001 && Math.abs(node.longitude - startCoords[1]) < 0.0001) && (
                    <CircleMarker
                        center={startCoords}
                        radius={8}
                        pathOptions={{
                            fillColor: '#059669',
                            fillOpacity: 1,
                            color: '#fff',
                            weight: 3,
                        }}
                    >
                        <Tooltip direction="top" offset={[0, -8]} permanent>
                            🟢 Asal: {startNode.name ? startNode.name.split(',')[0] : 'Titik Awal'}
                        </Tooltip>
                    </CircleMarker>
                )}

                {/* Draw dedicated dynamic goal marker if it doesn't overlap with db nodes */}
                {goalCoords && !nodes.some(node => Math.abs(node.latitude - goalCoords[0]) < 0.0001 && Math.abs(node.longitude - goalCoords[1]) < 0.0001) && (
                    <CircleMarker
                        center={goalCoords}
                        radius={8}
                        pathOptions={{
                            fillColor: '#ef4444',
                            fillOpacity: 1,
                            color: '#fff',
                            weight: 3,
                        }}
                    >
                        <Tooltip direction="top" offset={[0, -8]} permanent>
                            🔴 Tujuan: {goalNode.name ? goalNode.name.split(',')[0] : 'Titik Tujuan'}
                        </Tooltip>
                    </CircleMarker>
                )}

                {/* Route polylines - inactive routes (behind) */}
                {routePolylines
                    .filter(r => !r.active)
                    .map((route) => (
                        <Polyline
                            key={`route-${route.index}`}
                            positions={route.positions}
                            eventHandlers={{
                                click: () => {
                                    if (onSelectRoute) onSelectRoute(route.index);
                                }
                            }}
                            pathOptions={{
                                color: route.color,
                                weight: 6,
                                opacity: 0.35,
                                dashArray: route.dash,
                                className: 'clickable-polyline',
                            }}
                        />
                    ))}

                {/* Active route (on top) */}
                {routePolylines
                    .filter(r => r.active)
                    .map((route) => (
                        <Polyline
                            key={`route-active-${route.index}`}
                            positions={route.positions}
                            eventHandlers={{
                                click: () => {
                                    if (onSelectRoute) onSelectRoute(route.index);
                                }
                            }}
                            pathOptions={{
                                color: route.color,
                                weight: 8,
                                opacity: 0.95,
                                dashArray: route.dash,
                                className: 'clickable-polyline',
                            }}
                        />
                    ))}

                {/* Active moving vehicle marker */}
                {currentSimPosition && carIcon && (
                    <Marker position={currentSimPosition} icon={carIcon} />
                )}
            </MapContainer>

            {/* Google Maps Navigation Mode HUD Overlay */}
            {isSimulating && (() => {
                const activeResult = results[activeRoute];
                if (!activeResult) return null;

                // Total distance & estimated driving duration
                const totalDist = activeResult.total_distance_km || 1;
                const totalDurationMin = Math.max(1, Math.round((totalDist / 35) * 60));
                
                // Progress percentage
                const progress = activePath && activePath.length > 0 ? simIndex / activePath.length : 0;
                
                // Remaining duration & distance
                const remainingDurationMin = Math.max(1, Math.ceil((1 - progress) * totalDurationMin));
                const remainingDistanceKm = ((1 - progress) * totalDist).toFixed(1);

                // Arrival time computation
                const now = new Date();
                now.setMinutes(now.getMinutes() + remainingDurationMin);
                const arrivalTimeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

                // Next street name detection
                const nextStreetName = activeResult.path && activeNodeIndex >= 0 && activeNodeIndex + 1 < activeResult.path.length
                    ? activeResult.path[activeNodeIndex + 1].name
                    : goalNode?.name || 'Tujuan';

                // Speed calculation
                const speed = navType === 'realtime'
                    ? gpsSpeed
                    : (simIndex === 0 || simIndex >= (activePath?.length || 0) - 2 ? 0 : Math.round(38 + Math.sin(simIndex * 0.8) * 5));

                // Direction arrow calculation
                const getDirectionArrow = () => {
                    if (simIndex >= (activePath?.length || 0) - 2) return '📍';
                    
                    const currentAngle = carAngle;
                    const nextCoord = activePath[simIndex + 1];
                    const futureCoord = activePath[simIndex + 3] || activePath[activePath.length - 1];
                    if (nextCoord && futureCoord) {
                        const dy = futureCoord[0] - nextCoord[0];
                        const dx = futureCoord[1] - nextCoord[1];
                        const futureAngle = Math.atan2(dx, dy) * (180 / Math.PI);
                        let diff = futureAngle - currentAngle;
                        if (diff > 180) diff -= 360;
                        if (diff < -180) diff += 360;
                        
                        if (diff > 25) return '➡️';
                        if (diff < -25) return '⬅️';
                    }
                    return '⬆️';
                };

                const arrowIcon = getDirectionArrow();

                return (
                    <>
                        {/* Top Green Banner */}
                        <div style={{
                            position: 'absolute',
                            top: 20,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: 'calc(100% - 40px)',
                            maxWidth: 500,
                            backgroundColor: '#005844',
                            borderRadius: 16,
                            padding: '16px 20px',
                            zIndex: 1000,
                            boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 20,
                            color: '#fff',
                            fontFamily: 'Inter, sans-serif'
                        }}>
                            <div style={{
                                fontSize: 32,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                minWidth: 44,
                                height: 44,
                                borderRadius: '50%',
                                backgroundColor: 'rgba(255,255,255,0.15)'
                            }}>
                                {arrowIcon}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {arrowIcon === '📍' ? 'Hampir Sampai' : 'Navigasi Aktif'}
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2, textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
                                    {arrowIcon === '📍' ? 'Tiba di Tujuan Anda' : `Ke arah ${nextStreetName.split(',')[0]}`}
                                </div>
                            </div>
                            <button style={{
                                border: 'none',
                                background: 'rgba(255,255,255,0.15)',
                                color: '#fff',
                                width: 38,
                                height: 38,
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                fontSize: 18
                            }}>
                                🎙️
                            </button>
                        </div>

                        {/* Floating Action Buttons (Right) */}
                        <div style={{
                            position: 'absolute',
                            right: 20,
                            top: 120,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 12,
                            zIndex: 1000
                        }}>
                            <button style={floatingBtnStyle} title="Kompas">🧭</button>
                            <button style={floatingBtnStyle} title="Cari Tempat">🔍</button>
                            <button style={floatingBtnStyle} title="Suara">🔊</button>
                            <button style={{ ...floatingBtnStyle, backgroundColor: '#fef2f2', color: '#ef4444', border: '1px solid #fee2e2' }} title="Laporkan Kendala">⚠️</button>
                        </div>

                        {/* Speedometer (Bottom Left) */}
                        <div style={{
                            position: 'absolute',
                            bottom: 120,
                            left: 20,
                            width: 68,
                            height: 68,
                            borderRadius: '50%',
                            backgroundColor: '#fff',
                            border: '4px solid #005844',
                            zIndex: 1000,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: 'Inter, sans-serif'
                        }}>
                            <span style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{speed}</span>
                            <span style={{ fontSize: 8, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginTop: 2 }}>km/h</span>
                        </div>

                        {/* Bottom Navigation Control Bar */}
                        <div style={{
                            position: 'absolute',
                            bottom: 20,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: 'calc(100% - 40px)',
                            maxWidth: 500,
                            backgroundColor: '#fff',
                            borderRadius: 24,
                            padding: '16px 20px',
                            zIndex: 1000,
                            boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontFamily: 'Inter, sans-serif',
                            border: '1px solid rgba(0,0,0,0.05)'
                        }}>
                            {/* Close Button X */}
                            <button 
                                onClick={() => setIsSimulating(false)}
                                style={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: '50%',
                                    border: '1px solid #e2e8f0',
                                    backgroundColor: '#fff',
                                    color: '#64748b',
                                    fontSize: 18,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                ✕
                            </button>

                            {/* Trip Info */}
                            <div style={{ textAlign: 'center', flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 24, fontWeight: 900, color: '#15803d' }}>
                                        {remainingDurationMin} min
                                    </span>
                                    <span style={{ fontSize: 18 }}>🍃</span>
                                </div>
                                <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginTop: 2 }}>
                                    {remainingDistanceKm} km • {arrivalTimeStr}
                                </div>
                            </div>

                            {/* GPS / Simulation Mode Toggle */}
                            <button 
                                onClick={() => setNavType(prev => prev === 'realtime' ? 'simulation' : 'realtime')}
                                style={{
                                    padding: '8px 14px',
                                    borderRadius: 16,
                                    border: '1.5px solid ' + (navType === 'realtime' ? '#10b981' : '#cbd5e1'),
                                    backgroundColor: navType === 'realtime' ? '#ecfdf5' : '#f8fafc',
                                    color: navType === 'realtime' ? '#047857' : '#475569',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    transition: 'all 0.2s',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                }}
                            >
                                {navType === 'realtime' ? '📡 GPS Riil' : '🚗 Simulasi'}
                            </button>
                        </div>
                    </>
                );
            })()}
        </div>
    );
}
