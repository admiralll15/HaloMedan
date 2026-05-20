<?php

namespace App\Http\Controllers;

use App\Models\Node;
use App\Models\Edge;
use App\Services\RouteService;
use Illuminate\Http\Request;
use Inertia\Inertia;

class RouteController extends Controller
{
    /**
     * Display the main route finder page.
     */
    public function index()
    {
        $nodes = Node::where('is_city', true)->orderBy('name')->get(['id', 'name', 'latitude', 'longitude']);
        $edges = Edge::with(['fromNode:id,name,latitude,longitude', 'toNode:id,name,latitude,longitude'])
            ->get(['id', 'node_from', 'node_to', 'distance_km', 'road_name']);

        return Inertia::render('RouteFinder', [
            'nodes' => $nodes,
            'edges' => $edges,
        ]);
    }

    /**
     * Calculate routes using selected algorithms.
     */
    public function calculate(Request $request)
    {
        $validated = $request->validate([
            'start' => 'required|array',
            'start.lat' => 'required|numeric',
            'start.lng' => 'required|numeric',
            'start.name' => 'required|string',
            'goal' => 'required|array',
            'goal.lat' => 'required|numeric',
            'goal.lng' => 'required|numeric',
            'goal.name' => 'required|string',
            'algorithms' => 'required|array|min:1',
            'algorithms.*' => 'in:ucs,astar,hill_climbing',
        ]);

        $service = new RouteService();
        
        $startId = -1;
        $goalId = -2;

        // Try to build a dynamic grid graph connecting start/goal via multiple alternative OSRM paths
        $hasDynamicGraph = $service->buildDynamicGraphFromOSRM(
            [
                'lat' => (float)$validated['start']['lat'],
                'lng' => (float)$validated['start']['lng'],
                'name' => $validated['start']['name']
            ],
            [
                'lat' => (float)$validated['goal']['lat'],
                'lng' => (float)$validated['goal']['lng'],
                'name' => $validated['goal']['name']
            ]
        );

        // Fallback to database static graph if offline or API limit reached
        if (!$hasDynamicGraph) {
            $service->buildGraph();
            $service->injectVirtualNode((float)$validated['start']['lat'], (float)$validated['start']['lng'], $validated['start']['name'], $startId);
            $service->injectVirtualNode((float)$validated['goal']['lat'], (float)$validated['goal']['lng'], $validated['goal']['name'], $goalId);
        }

        $results = [];

        foreach ($validated['algorithms'] as $algo) {
            $res = null;
            switch ($algo) {
                case 'ucs':
                    $res = $service->uniformCostSearch($startId, $goalId);
                    break;
                case 'astar':
                    $res = $service->aStarSearch($startId, $goalId);
                    break;
                case 'hill_climbing':
                    $res = $service->hillClimbing($startId, $goalId);
                    break;
            }

            if ($res && $res['found'] && !empty($res['path'])) {
                $routeData = $this->fetchRouteGeometry($res['path']);
                $res['geometry'] = $routeData['coordinates'];
                
                // Jika OSRM berhasil menemukan jalan raya asli, gantikan path node-nya dengan nama-nama jalan yang dilewati
                if (!empty($routeData['streets'])) {
                    $res['path'] = $routeData['streets'];
                    $res['path_length'] = count($routeData['streets']);
                }
            } else {
                $res['geometry'] = [];
            }

            $results[] = $res;
        }

        return response()->json([
            'results' => $results,
            'start' => ['id' => $startId, 'name' => $validated['start']['name'], 'latitude' => $validated['start']['lat'], 'longitude' => $validated['start']['lng']],
            'goal' => ['id' => $goalId, 'name' => $validated['goal']['name'], 'latitude' => $validated['goal']['lat'], 'longitude' => $validated['goal']['lng']],
        ]);
    }

    /**
     * Fetch actual street road geometry coordinates and street names from OSRM
     */
    private function fetchRouteGeometry(array $path): array
    {
        if (count($path) < 2) return ['coordinates' => [], 'streets' => []];

        // Build coordinates query: lon,lat;lon,lat;...
        $coords = [];
        foreach ($path as $node) {
            $lat = is_object($node) ? $node->latitude : $node['latitude'];
            $lng = is_object($node) ? $node->longitude : $node['longitude'];
            $coords[] = $lng . ',' . $lat;
        }
        $coordsStr = implode(';', $coords);
        
        $url = "https://router.project-osrm.org/route/v1/driving/{$coordsStr}?overview=full&geometries=geojson&steps=true";
        
        try {
            $response = \Illuminate\Support\Facades\Http::withOptions([
                'verify' => false
            ])->timeout(4)->get($url);

            if ($response->successful()) {
                $data = $response->json();
                $coordinates = [];
                $streets = [];

                if (isset($data['routes'][0]['geometry']['coordinates'])) {
                    $rawCoords = $data['routes'][0]['geometry']['coordinates'];
                    // OSRM returns [lon, lat], convert to [lat, lon] for Leaflet
                    $coordinates = array_map(function ($coord) {
                        return [$coord[1], $coord[0]];
                    }, $rawCoords);
                }

                // Ambil daftar jalan raya asli dari detail langkah navigasi OSRM
                if (isset($data['routes'][0]['legs'])) {
                    $startNodeObj = $path[0];
                    $goalNodeObj = $path[count($path) - 1];

                    // Tambahkan Titik Mulai pertama kali
                    $streets[] = [
                        'id' => is_object($startNodeObj) ? $startNodeObj->id : $startNodeObj['id'],
                        'name' => is_object($startNodeObj) ? $startNodeObj->name : $startNodeObj['name'],
                        'latitude' => is_object($startNodeObj) ? $startNodeObj->latitude : $startNodeObj['latitude'],
                        'longitude' => is_object($startNodeObj) ? $startNodeObj->longitude : $startNodeObj['longitude']
                    ];

                    $seenStreets = [];
                    $virtualId = -100;

                    foreach ($data['routes'][0]['legs'] as $leg) {
                        if (isset($leg['steps'])) {
                            foreach ($leg['steps'] as $step) {
                                $streetName = trim($step['name'] ?? '');
                                
                                // Bersihkan nama jalan dan filter yang kosong/tidak valid
                                if ($streetName === '' || strtolower($streetName) === 'rotary' || strtolower($streetName) === 'roundabout') {
                                    continue;
                                }

                                // Hindari duplikasi beruntun nama jalan yang sama
                                if (in_array(strtolower($streetName), $seenStreets)) {
                                    continue;
                                }

                                $loc = $step['maneuver']['location'] ?? null;
                                if ($loc && count($loc) >= 2) {
                                    $streets[] = [
                                        'id' => $virtualId--,
                                        'name' => $streetName,
                                        'latitude' => $loc[1],
                                        'longitude' => $loc[0]
                                    ];
                                    $seenStreets[] = strtolower($streetName);
                                }
                            }
                        }
                    }

                    // Tambahkan Titik Tujuan paling akhir jika belum ada
                    $streets[] = [
                        'id' => is_object($goalNodeObj) ? $goalNodeObj->id : $goalNodeObj['id'],
                        'name' => is_object($goalNodeObj) ? $goalNodeObj->name : $goalNodeObj['name'],
                        'latitude' => is_object($goalNodeObj) ? $goalNodeObj->latitude : $goalNodeObj['latitude'],
                        'longitude' => is_object($goalNodeObj) ? $goalNodeObj->longitude : $goalNodeObj['longitude']
                    ];
                }

                return [
                    'coordinates' => $coordinates,
                    'streets' => $streets
                ];
            }
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::warning("OSM routing geometry fetch failed: " . $e->getMessage());
        }

        return ['coordinates' => [], 'streets' => []];
    }

    /**
     * Proxy to Nominatim OSM to provide Google Maps-like rich location search
     */
    public function searchLocation(Request $request)
    {
        $q = $request->query('q');
        if (!$q || strlen($q) < 3) return response()->json([]);

        $cacheKey = 'search_nominatim_' . md5($q);
        
        $formatted = \Illuminate\Support\Facades\Cache::remember($cacheKey, 86400, function () use ($q) {
            // Viewbox khusus area Medan & sekitarnya agar pencarian lebih akurat
            $viewbox = '98.50,3.75,98.80,3.45'; 
            $url = "https://nominatim.openstreetmap.org/search?format=json&q=" . urlencode($q) . "&countrycodes=id&viewbox={$viewbox}&bounded=1&limit=8";

            // 1. Coba Nominatim dengan timeout lebih singkat (3 detik)
            try {
                $response = \Illuminate\Support\Facades\Http::withOptions([
                    'verify' => false
                ])->withHeaders([
                    // User-Agent unik agar tidak diblokir Nominatim
                    'User-Agent' => 'HaloMedan/2.0 (admin@halomedan.com)'
                ])->timeout(3)->get($url);

                if ($response->successful()) {
                    $data = $response->json();
                    $result = [];

                    if (is_array($data)) {
                        foreach ($data as $item) {
                            if (isset($item['lat']) && isset($item['lon'])) {
                                $result[] = [
                                    'display_name' => $item['display_name'] ?? $item['name'] ?? '',
                                    'lat' => $item['lat'],
                                    'lon' => $item['lon']
                                ];
                            }
                        }
                    }
                    if (!empty($result)) {
                        return $result;
                    }
                }
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::warning("Nominatim proxy slow/failed, checking fallback: " . $e->getMessage());
            }

            // 2. Fallback instan ke Photon Komoot jika Nominatim lambat atau error
            try {
                $photonUrl = "https://photon.komoot.io/api/?q=" . urlencode($q) . "&bbox=98.50,3.45,98.80,3.75&limit=8";
                $response = \Illuminate\Support\Facades\Http::withOptions([
                    'verify' => false
                ])->timeout(3)->get($photonUrl);

                if ($response->successful()) {
                    $data = $response->json();
                    $result = [];
                    if (isset($data['features']) && is_array($data['features'])) {
                        foreach ($data['features'] as $feature) {
                            $props = $feature['properties'] ?? [];
                            $geom = $feature['geometry'] ?? [];
                            if (isset($geom['coordinates']) && count($geom['coordinates']) >= 2) {
                                $name = $props['name'] ?? '';
                                $street = $props['street'] ?? '';
                                $city = $props['city'] ?? '';
                                $state = $props['state'] ?? '';
                                $parts = array_filter([$name, $street, $city, $state]);
                                $displayName = implode(', ', $parts);

                                $result[] = [
                                    'display_name' => $displayName,
                                    'lat' => $geom['coordinates'][1],
                                    'lon' => $geom['coordinates'][0]
                                ];
                            }
                        }
                    }
                    return $result;
                }
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::error("Photon fallback failed: " . $e->getMessage());
            }

            return [];
        });

        return response()->json($formatted);
    }
}
