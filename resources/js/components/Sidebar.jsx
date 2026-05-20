import React, { useState, useEffect, useRef } from 'react';

const ALGOS = [
    { id: 'ucs', label: 'Uniform Cost Search', color: '#059669' },
    { id: 'astar', label: 'A* (Haversine)', color: '#2563eb' },
    { id: 'hill_climbing', label: 'Hill Climbing', color: '#d97706' },
];

// Client-side haversine for distance between two lat/lng points (km)
function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}


function getMockPlaceDetails(fullName) {
    const firstPart = fullName.split(',')[0].toLowerCase();
    
    let rating = 4.5;
    let reviews = 120;
    let price = 'Rp 25–50 rb';
    let type = 'Tempat Wisata';
    let features = 'Akses ramah kursi roda';
    let phone = '0812-3456-7890';
    
    // Stable hash based on name to keep it consistent
    let hash = 0;
    for (let i = 0; i < fullName.length; i++) {
        hash = fullName.charCodeAt(i) + ((hash << 5) - hash);
    }
    hash = Math.abs(hash);
    
    rating = (4.0 + (hash % 10) / 10).toFixed(1);
    reviews = 50 + (hash % 950);
    
    if (firstPart.includes('kopi') || firstPart.includes('coffee') || firstPart.includes('cafe')) {
        type = 'Kedai Kopi';
        price = 'Rp 20–60 rb';
        features = 'Makan di tempat • Bawa pulang';
    } else if (firstPart.includes('mall') || firstPart.includes('plaza') || firstPart.includes('square')) {
        type = 'Pusat Perbelanjaan';
        price = 'Rp 50–500 rb';
        features = 'Toko pakaian • Bioskop • Food court';
    } else if (firstPart.includes('masjid') || firstPart.includes('vihara') || firstPart.includes('gereja')) {
        type = 'Tempat Ibadah';
        price = 'Gratis';
        features = 'Area parkir • Toilet umum';
    } else if (firstPart.includes('universitas') || firstPart.includes('kampus') || firstPart.includes('usu') || firstPart.includes('unimed')) {
        type = 'Institusi Pendidikan';
        price = 'Kampus';
        features = 'Perpustakaan • Area hijau';
    } else if (firstPart.includes('halte') || firstPart.includes('bus') || firstPart.includes('stasiun')) {
        type = 'Pemberhentian Transit';
        price = 'Rp 5–15 rb';
        features = 'Akses disabilitas';
    } else if (firstPart.includes('rs') || firstPart.includes('siloam') || firstPart.includes('rumah sakit')) {
        type = 'Rumah Sakit';
        price = 'BPJS / Umum';
        features = 'IGD 24 Jam • Farmasi';
    }
    
    return { rating, reviews, price, type, features, phone };
}

export default function Sidebar({ 
    nodes, onCalculate, onReset, loading, results, showResults, activeRoute, onSelectRoute,
    mode, setMode, startNode, setStartNode, goalNode, setGoalNode,
    isSimulating, setIsSimulating, simIndex, setSimIndex,
    simFinished, setSimFinished,
    activeAnimationPath, activeNodeIndex, gpsDetecting, userGpsLocation
}) {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selAlgos, setSelAlgos] = useState(['ucs', 'astar', 'hill_climbing']);

    const debounceTimeoutRef = useRef(null);
    const searchAbortControllerRef = useRef(null);

    const handleSearch = (text) => {
        setSearchQuery(text);
        if (text.length < 2) {
            setSearchResults([]);
            return;
        }

        // 1. Tampilkan data lokal dari DB secara instan tanpa loading
        const dbMatches = nodes.filter(n => n.name.toLowerCase().includes(text.toLowerCase())).map(n => ({
            name: n.name,
            lat: n.latitude,
            lng: n.longitude,
            source: 'db'
        }));
        setSearchResults(dbMatches);

        if (text.length < 3) return;

        setSearchLoading(true);

        // Reset debounce timer
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }

        // 2. Debounce panggilan API luar sebesar 300ms agar ketikan lancar dan responsif
        debounceTimeoutRef.current = setTimeout(async () => {
            if (searchAbortControllerRef.current) {
                searchAbortControllerRef.current.abort();
            }
            searchAbortControllerRef.current = new AbortController();
            const signal = searchAbortControllerRef.current.signal;

            try {
                const res = await fetch(`/api/search-location?q=${encodeURIComponent(text)}`, { signal });
                if (res.ok) {
                    const osmData = await res.json();
                    if (Array.isArray(osmData)) {
                        const osmMatches = osmData.map(item => ({
                            name: item.display_name,
                            lat: parseFloat(item.lat),
                            lng: parseFloat(item.lon),
                            source: 'osm'
                        }));
                        // Gabungkan hasil lokal dan API secara halus
                        setSearchResults([...dbMatches, ...osmMatches]);
                    }
                }
            } catch (e) {
                if (e.name !== 'AbortError') {
                    console.error("OSM Error:", e);
                }
            } finally {
                setSearchLoading(false);
            }
        }, 300);
    };


    const handleRouteSelect = (place) => {
        setGoalNode(place);
        setMode('directions');
    };

    const handleSwapNodes = () => {
        const temp = startNode;
        setStartNode(goalNode);
        setGoalNode(temp);
    };

    const toggleAlgo = (id) => setSelAlgos(p => p.includes(id) ? p.filter(a => a !== id) : [...p, id]);

    const handleSubmitDirections = (e) => {
        e.preventDefault();
        if (startNode && goalNode && selAlgos.length > 0) {
            onCalculate(startNode, goalNode, selAlgos);
        }
    };

    const handleResetDirections = () => {
        onReset(); // reset handles startNode internally (keeps GPS)
        setGoalNode(null);
    };

    // Calculate active path for simulation progress
    const activePath = results[activeRoute]?.path || [];
    const animPath = activeAnimationPath || [];

    // activeNodeIndex is now received as a prop from RouteFinder.jsx

    return (
        <div style={{ width: 400, minWidth: 400, height: '100vh', background: '#fff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', zIndex: 10, boxShadow: '4px 0 24px rgba(0,0,0,0.04)', fontFamily: 'Inter, sans-serif' }}>
            
            {/* GOOGLE MAPS STYLE SEARCH PANEL */}
            {mode === 'search' && (
                <>
                    {/* Header / Search Input */}
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#059669,#10b981)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 16 }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>
                            </div>
                            <div>
                                <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>HaloMedan</h1>
                                <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Route Navigator</p>
                            </div>
                        </div>

                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <input 
                                type="text"
                                value={searchQuery}
                                onChange={(e) => handleSearch(e.target.value)}
                                placeholder="Cari tempat atau jalan di Medan..."
                                style={{ width: '100%', padding: '12px 40px 12px 16px', borderRadius: 24, border: '1.5px solid #e2e8f0', background: '#f8fafc', fontSize: 14, color: '#334155', outline: 'none', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
                                onFocus={(e) => e.target.style.borderColor = '#059669'}
                                onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                            />
                            <div style={{ position: 'absolute', right: 16, color: '#94a3b8' }}>
                                {searchLoading ? (
                                    <div style={{ width: 18, height: 18, border: '2px solid #cbd5e1', borderTopColor: '#059669', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                                ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Content area: Categories or Results */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                        {searchQuery.length < 2 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '200px', height: '100%', color: '#94a3b8', textAlign: 'center', padding: '40px 20px' }}>
                                {gpsDetecting ? (
                                    <>
                                        <div style={{ width: 32, height: 32, border: '3px solid #cbd5e1', borderTopColor: '#059669', borderRadius: '50%', animation: 'spin 0.7s linear infinite', marginBottom: 12 }} />
                                        <div style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>Mendeteksi Lokasi GPS...</div>
                                        <div style={{ fontSize: 12, marginTop: 4 }}>Mengambil lokasi Anda saat ini</div>
                                    </>
                                ) : userGpsLocation ? (
                                    <>
                                        <div style={{ fontSize: 40, marginBottom: 12 }}>📍</div>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: '#059669' }}>Lokasi Terdeteksi</div>
                                        <div style={{ fontSize: 12, marginTop: 4, maxWidth: 280, lineHeight: 1.5, color: '#475569' }}>{userGpsLocation.name}</div>
                                        <div style={{ fontSize: 12, marginTop: 12, color: '#94a3b8', maxWidth: 280, lineHeight: 1.5 }}>Cari tujuan di atas, lalu klik <b>Rute</b> untuk melihat perbandingan algoritma navigasi.</div>
                                    </>
                                ) : (
                                    <>
                                        <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
                                        <div style={{ fontSize: 14, fontWeight: 600, color: '#475569' }}>Cari Lokasi di Medan</div>
                                        <div style={{ fontSize: 12, marginTop: 4, maxWidth: 280, lineHeight: 1.5 }}>Ketikkan nama jalan, kampus, mall, atau lokasi lainnya di Medan pada kolom pencarian di atas.</div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <h3 style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Hasil Pencarian</h3>
                                
                                {searchResults.length === 0 && !searchLoading && (
                                    <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                                        Tidak ditemukan tempat dengan nama "{searchQuery}"
                                    </div>
                                )}

                                {searchResults.map((place, idx) => {
                                    const details = getMockPlaceDetails(place.name);
                                    const parsedName = place.name.split(',')[0];
                                    const parsedAddress = place.name.split(',').slice(1, 3).join(',').trim();

                                    return (
                                        <div key={idx} style={{ padding: 16, borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', display: 'flex', flexDirection: 'column', gap: 10, transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                                            <div>
                                                <h4 style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', margin: '0 0 4px 0' }}>{parsedName}</h4>
                                                
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
                                                    <span style={{ fontWeight: 600, color: '#d97706' }}>{details.rating}</span>
                                                    <div style={{ display: 'flex', gap: 1 }}>
                                                        {Array.from({ length: 5 }).map((_, i) => (
                                                            <span key={i} style={{ color: i < Math.floor(details.rating) ? '#f59e0b' : '#cbd5e1' }}>★</span>
                                                        ))}
                                                    </div>
                                                    <span>({details.reviews})</span>
                                                    <span>•</span>
                                                    <span>{details.type}</span>
                                                </div>

                                                <p style={{ fontSize: 11, color: '#94a3b8', margin: '6px 0 0 0', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                                    📍 {parsedAddress || 'Kota Medan, Sumatera Utara'}
                                                </p>
                                                <p style={{ fontSize: 11, color: '#64748b', margin: '4px 0 0 0' }}>
                                                    🍽️ {details.features}
                                                </p>
                                            </div>

                                            <div style={{ display: 'flex', gap: 8, borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
                                                <button 
                                                    onClick={() => handleRouteSelect(place)}
                                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', borderRadius: 20, border: 'none', background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}
                                                    onMouseOver={e => e.currentTarget.style.background = '#1d4ed8'}
                                                    onMouseOut={e => e.currentTarget.style.background = '#2563eb'}
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                                                    Rute
                                                </button>
                                                <a 
                                                    href="https://google.com" 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', borderRadius: 20, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 12, fontWeight: 600, textDecoration: 'none', transition: 'background 0.2s' }}
                                                    onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                                                    onMouseOut={e => e.currentTarget.style.background = '#fff'}
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                                                    Situs Web
                                                </a>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* DIRECTIONS PANEL */}
            {mode === 'directions' && (
                <>
                    {/* Header / Swap Inputs */}
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                        <button 
                            onClick={() => { setMode('search'); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', color: '#2563eb', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, marginBottom: 16 }}
                        >
                            ← Kembali ke Pencarian
                        </button>

                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <LocationSearch 
                                    label="Titik Asal" 
                                    dotColor="#059669" 
                                    placeholder="Cari lokasi asal (Mis: USU)..."
                                    value={startNode}
                                    onChange={setStartNode}
                                    predefinedNodes={nodes}
                                    userGpsLocation={userGpsLocation}
                                />
                                <LocationSearch 
                                    label="Titik Tujuan" 
                                    dotColor="#ef4444" 
                                    placeholder="Titik Tujuan"
                                    value={goalNode}
                                    onChange={setGoalNode}
                                    predefinedNodes={nodes}
                                />
                            </div>

                            <button 
                                onClick={handleSwapNodes}
                                style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                            >
                                🔄
                            </button>
                        </div>
                    </div>

                    {/* Options, Compare Results & Controls */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                        <form onSubmit={handleSubmitDirections}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 10 }}>Algoritma</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {ALGOS.map(a => (
                                    <label key={a.id} onClick={() => toggleAlgo(a.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${selAlgos.includes(a.id) ? a.color + '40' : '#e2e8f0'}`, background: selAlgos.includes(a.id) ? a.color + '08' : '#fff', cursor: 'pointer', transition: 'all 0.2s' }}>
                                        <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${selAlgos.includes(a.id) ? a.color : '#cbd5e1'}`, background: selAlgos.includes(a.id) ? a.color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            {selAlgos.includes(a.id) && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><polyline points="20 6 9 17 4 12"/></svg>}
                                        </div>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{a.label}</span>
                                    </label>
                                ))}
                            </div>

                            <div style={{ height: 20 }} />
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button type="submit" disabled={loading || !startNode || !goalNode || !selAlgos.length}
                                    style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: 'none', background: loading ? '#94a3b8' : 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: loading ? 'none' : '0 2px 8px rgba(5,150,105,0.3)' }}>
                                    {loading ? 'Menghitung...' : '🔍 Cari Rute'}
                                </button>
                                <button type="button" onClick={handleResetDirections} style={{ padding: '12px 16px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Reset</button>
                            </div>
                        </form>

                        {/* Demo Perjalanan Rute */}
                        {showResults && results.length > 0 && results[activeRoute]?.found && (
                            <div style={{ marginTop: 24, padding: 16, borderRadius: 12, border: `1.5px solid ${simFinished ? '#05966940' : '#2563eb30'}`, background: simFinished ? '#05966908' : '#2563eb05', display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{simFinished ? '✅ Demo Selesai' : '🚗 Demo Perjalanan'}</span>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: simFinished ? '#059669' : '#2563eb', background: simFinished ? '#ecfdf5' : '#e0f2fe', padding: '2px 8px', borderRadius: 99 }}>
                                        {simFinished ? 'Tiba di Tujuan' : animPath.length > 0 ? `${Math.round(((simIndex + 1) / animPath.length) * 100)}%` : '0%'}
                                    </span>
                                </div>

                                <div style={{ height: 6, background: '#cbd5e1', borderRadius: 3, overflow: 'hidden' }}>
                                    <div style={{ height: '100%', background: simFinished ? '#059669' : '#2563eb', width: simFinished ? '100%' : (animPath.length > 0 ? `${((simIndex + 1) / animPath.length) * 100}%` : '0%'), transition: 'width 0.15s linear' }} />
                                </div>

                                {simFinished ? (
                                    <button 
                                        onClick={() => { setSimFinished(false); setSimIndex(0); }}
                                        style={{ width: '100%', padding: '10px 14px', borderRadius: 20, border: 'none', background: '#059669', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}
                                    >
                                        <span style={{ fontSize: 12 }}>🔄</span> Ulangi Demo
                                    </button>
                                ) : (
                                    <button 
                                        onClick={() => { if (isSimulating) { setIsSimulating(false); } else { setSimFinished(false); setSimIndex(0); setIsSimulating(true); } }}
                                        style={{ width: '100%', padding: '10px 14px', borderRadius: 20, border: 'none', background: isSimulating ? '#dc2626' : '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}
                                    >
                                        {isSimulating ? (
                                            <><span style={{ fontSize: 12 }}>⏹️</span> Hentikan Demo</>
                                        ) : (
                                            <><span style={{ fontSize: 12 }}>▶️</span> Demo Perjalanan Rute</>
                                        )}
                                    </button>
                                )}

                                {(isSimulating || simFinished) && goalNode && (
                                    <div style={{ fontSize: 12, color: '#475569', textAlign: 'center', fontStyle: 'italic' }}>
                                        Rute: <b>{startNode?.name?.split(',')[0]}</b> → <b>{goalNode?.name?.split(',')[0]}</b>
                                    </div>
                                )}
                            </div>
                        )}

                        {showResults && results.length > 0 && !results[activeRoute]?.found && (
                            <div style={{ marginTop: 24, padding: 16, borderRadius: 12, border: '1.5px solid #ef444430', background: '#fef2f2', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c' }}>⚠️ Rute Gagal Ditemukan</span>
                                <span style={{ fontSize: 11, color: '#7f1d1d', lineHeight: 1.4 }}>
                                    Algoritma <b>{results[activeRoute]?.algorithm}</b> gagal menemukan rute menuju tujuan. 
                                    {results[activeRoute]?.message && ` Keterangan: ${results[activeRoute].message}`}
                                </span>
                            </div>
                        )}

                        {/* Route Comparison Cards */}
                        {showResults && results.length > 0 && (
                            <div style={{ marginTop: 24 }}>
                                <p style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Hasil Perbandingan</p>
                                {results.map((r, i) => (
                                    <div 
                                        key={i} 
                                        onClick={() => { onSelectRoute(i); setSimIndex(0); setSimFinished(false); setIsSimulating(false); }} 
                                        style={{ padding: '14px 16px', borderRadius: 12, border: `1.5px solid ${activeRoute === i ? (r.algorithm === 'UCS' ? '#05966940' : r.algorithm === 'A*' ? '#2563eb40' : '#d9770640') : '#e2e8f0'}`, background: activeRoute === i ? (r.algorithm === 'UCS' ? '#05966906' : r.algorithm === 'A*' ? '#2563eb06' : '#d9770606') : '#fff', cursor: 'pointer', transition: 'all 0.2s', marginBottom: 10 }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: r.algorithm === 'UCS' ? '#059669' : r.algorithm === 'A*' ? '#2563eb' : '#d97706' }} />
                                                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{r.algorithm}</span>
                                            </div>
                                            <span style={{ fontSize: 10, fontWeight: 600, color: r.found ? '#059669' : '#dc2626', background: r.found ? '#ecfdf5' : '#fef2f2', padding: '2px 8px', borderRadius: 99 }}>
                                                {r.found ? 'DITEMUKAN' : 'GAGAL'}
                                            </span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                            <Stat label="Jarak" value={r.total_distance_km} unit="km" />
                                            <Stat label="Titik Dilalui" value={r.nodes_visited} />
                                            <Stat label="Waktu" value={r.execution_time_ms} unit="ms" />
                                        </div>
                                        {activeRoute === i && r.path?.length > 0 && (
                                            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                                                <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Detail Petunjuk Jalan ({r.path_length} rute)</p>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                                    {r.path.map((node, idx) => {
                                                        const isFirst = idx === 0;
                                                        const isLast = idx === r.path.length - 1;
                                                        const isActiveStep = activeNodeIndex === idx;
                                                        const isPassed = activeNodeIndex > idx && (isSimulating || simFinished);
                                                        
                                                        // Calculate distance from previous point
                                                        let distFromPrev = 0;
                                                        if (idx > 0) {
                                                            const prev = r.path[idx - 1];
                                                            distFromPrev = haversineKm(prev.latitude, prev.longitude, node.latitude, node.longitude);
                                                        }
                                                        
                                                        let icon, iconColor, iconBg;
                                                        let stepTitle = node.name.split(',')[0];
                                                        let subtitle = '';
                                                        
                                                        if (isFirst) {
                                                            icon = '🟢'; iconColor = '#059669'; iconBg = '#ecfdf5';
                                                            stepTitle = `Mulai dari ${stepTitle}`;
                                                            subtitle = 'Titik awal keberangkatan Anda';
                                                        } else if (isLast) {
                                                            icon = '📍'; iconColor = '#ef4444'; iconBg = '#fef2f2';
                                                            stepTitle = `Tiba di tujuan: ${stepTitle}`;
                                                            subtitle = `Destinasi akhir • Total ${r.total_distance_km} km`;
                                                        } else if (isPassed) {
                                                            icon = '✓'; iconColor = '#059669'; iconBg = '#ecfdf5';
                                                            stepTitle = `Lewati ${stepTitle}`;
                                                            subtitle = `✓ Sudah dilewati • ±${distFromPrev.toFixed(1)} km`;
                                                        } else if (isActiveStep) {
                                                            icon = '🚗'; iconColor = '#2563eb'; iconBg = '#dbeafe';
                                                            stepTitle = `Sedang melewati ${stepTitle}`;
                                                            subtitle = `Jarak ±${distFromPrev.toFixed(1)} km dari titik sebelumnya`;
                                                        } else {
                                                            icon = '•'; iconColor = '#94a3b8'; iconBg = '#f1f5f9';
                                                            const nextNode = r.path[idx + 1];
                                                            stepTitle = `Lewati ${stepTitle}`;
                                                            subtitle = nextNode ? `Lanjut ke ${nextNode.name.split(',')[0]} • ±${distFromPrev.toFixed(1)} km` : `±${distFromPrev.toFixed(1)} km`;
                                                        }

                                                        return (
                                                            <div key={node.id || idx} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', minWidth: 24 }}>
                                                                    <div style={{ 
                                                                        width: 24, height: 24, borderRadius: '50%', 
                                                                        background: isPassed ? '#ecfdf5' : iconBg,
                                                                        color: isPassed ? '#059669' : iconColor,
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                        fontSize: isPassed ? 11 : 12, fontWeight: 700,
                                                                        border: isActiveStep ? '2px solid #2563eb' : isPassed ? '1.5px solid #059669' : '1px solid #cbd5e1',
                                                                        boxShadow: isActiveStep ? '0 0 0 3px rgba(37,99,235,0.2)' : 'none',
                                                                        zIndex: 2, transition: 'all 0.2s'
                                                                    }}>
                                                                        {icon}
                                                                    </div>
                                                                    {!isLast && (
                                                                        <div style={{ 
                                                                            width: 2, flex: 1, minHeight: 18,
                                                                            background: isPassed ? '#059669' : isActiveStep ? 'linear-gradient(to bottom, #2563eb, #cbd5e1)' : '#cbd5e1', 
                                                                            marginTop: 4, marginBottom: 4, zIndex: 1
                                                                        }} />
                                                                    )}
                                                                </div>
                                                                <div style={{ flex: 1, paddingTop: 2 }}>
                                                                    <div style={{ 
                                                                        fontSize: 12, 
                                                                        fontWeight: isActiveStep || isFirst || isLast ? 700 : isPassed ? 600 : 500,
                                                                        color: isPassed ? '#059669' : isActiveStep ? '#2563eb' : '#334155',
                                                                        lineHeight: 1.4,
                                                                        textDecoration: isPassed && !isFirst ? 'none' : 'none'
                                                                    }}>
                                                                        {stepTitle}
                                                                    </div>
                                                                    <div style={{ fontSize: 10, color: isPassed ? '#10b981' : '#94a3b8', marginTop: 2 }}>
                                                                        {subtitle}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}

            <div style={{ padding: '12px 24px', borderTop: '1px solid #f1f5f9', background: '#fafbfc' }}>
                <p style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', margin: 0 }}>Mendukung navigasi rute jalan raya real-time di seluruh Kota Medan</p>
            </div>
            
            {/* Spinner keyframe animation */}
            <style>{`
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}

function LocationSearch({ label, dotColor, placeholder, value, onChange, predefinedNodes, userGpsLocation }) {
    const [query, setQuery] = useState(value?.name || '');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [show, setShow] = useState(false);
    const wrapperRef = useRef(null);
    const debounceRef = useRef(null);
    const abortRef = useRef(null);

    useEffect(() => {
        if (value) setQuery(value.source === 'gps' ? `📍 ${value.name}` : value.name);
        else setQuery('');
    }, [value]);

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setShow(false);
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const search = (text) => {
        setQuery(text);
        if (text.length < 2) { setResults([]); setShow(true); return; }
        setShow(true);
        const dbMatches = predefinedNodes.filter(n => n.name.toLowerCase().includes(text.toLowerCase())).map(n => ({ name: n.name, lat: n.latitude, lng: n.longitude, source: 'db' }));
        setResults(dbMatches);
        if (text.length < 3) return;
        setLoading(true);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            if (abortRef.current) abortRef.current.abort();
            abortRef.current = new AbortController();
            try {
                const res = await fetch(`/api/search-location?q=${encodeURIComponent(text)}`, { signal: abortRef.current.signal });
                if (res.ok) {
                    const d = await res.json();
                    if (Array.isArray(d)) { setResults([...dbMatches, ...d.map(i => ({ name: i.display_name, lat: parseFloat(i.lat), lng: parseFloat(i.lon), source: 'osm' }))]); }
                }
            } catch (e) { if (e.name !== 'AbortError') console.error(e); }
            finally { setLoading(false); }
        }, 300);
    };

    const handleSelect = (item) => { onChange(item); setQuery(item.source === 'gps' ? `📍 ${item.name}` : item.name); setShow(false); };

    return (
        <div ref={wrapperRef} style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                {dotColor && <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block' }} />}
                {label}
            </div>
            <input type="text" value={query} onChange={(e) => search(e.target.value)} onFocus={() => setShow(true)} placeholder={placeholder}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: value?.source === 'gps' ? '#ecfdf5' : '#fff', fontSize: 13, color: '#334155', outline: 'none', fontFamily: 'Inter,sans-serif' }}
            />
            
            {show && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, marginTop: 4, zIndex: 50, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 250, overflowY: 'auto' }}>
                    {/* 'Lokasi Anda' option — like Google Maps */}
                    {userGpsLocation && (
                        <div onClick={() => handleSelect(userGpsLocation)}
                            style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.2s' }}
                            onMouseOver={e => e.currentTarget.style.background = '#ecfdf5'}
                            onMouseOut={e => e.currentTarget.style.background = '#fff'}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#ecfdf5', border: '1.5px solid #059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>📍</div>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>Lokasi Anda</div>
                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>{userGpsLocation.name}</div>
                            </div>
                        </div>
                    )}
                    {loading && <div style={{ padding: 12, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Mencari...</div>}
                    {!loading && query.length >= 3 && results.length === 0 && <div style={{ padding: 12, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Tidak ditemukan di area ini.</div>}
                    {!loading && results.map((item, idx) => (
                        <div key={idx} onClick={() => handleSelect(item)}
                            style={{ padding: '10px 12px', borderBottom: idx < results.length - 1 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', fontSize: 12, color: '#334155', transition: 'background 0.2s' }}
                            onMouseOver={e => e.currentTarget.style.background = '#f8fafc'}
                            onMouseOut={e => e.currentTarget.style.background = '#fff'}>
                            <div style={{ fontWeight: 600 }}>{item.name.split(',')[0]}</div>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function Stat({ label, value, unit }) {
    return (
        <div>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>{value} {unit && <span style={{ fontSize: 10, fontWeight: 500, color: '#94a3b8' }}>{unit}</span>}</div>
        </div>
    );
}
