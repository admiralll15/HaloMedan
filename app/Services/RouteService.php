<?php

namespace App\Services;

use App\Models\Node;
use App\Models\Edge;

class RouteService
{
    private array $adjacencyList = [];
    private array $nodeMap = [];

    /**
     * Build the graph from database.
     */
    public function buildGraph(): void
    {
        $nodes = Node::all();
        $edges = Edge::all();

        foreach ($nodes as $node) {
            $this->nodeMap[$node->id] = $node;
            $this->adjacencyList[$node->id] = [];
        }

        foreach ($edges as $edge) {
            // Bidirectional
            $this->adjacencyList[$edge->node_from][] = [
                'to' => $edge->node_to,
                'distance' => $edge->distance_km,
                'road' => $edge->road_name,
            ];
            $this->adjacencyList[$edge->node_to][] = [
                'to' => $edge->node_from,
                'distance' => $edge->distance_km,
                'road' => $edge->road_name,
            ];
        }
    }

    /**
     * Inject a virtual node (dynamic coordinates) into the graph by connecting it to the nearest existing node.
     */
    public function injectVirtualNode(float $lat, float $lon, string $name, int $id): void
    {
        $virtualNode = new \stdClass();
        $virtualNode->id = $id;
        $virtualNode->name = $name;
        $virtualNode->latitude = $lat;
        $virtualNode->longitude = $lon;
        
        $this->nodeMap[$id] = $virtualNode;
        $this->adjacencyList[$id] = [];

        $nearestId = null;
        $minDist = PHP_FLOAT_MAX;

        foreach ($this->nodeMap as $nodeId => $node) {
            if ($nodeId <= 0) continue; // Jangan biarkan Virtual Node snap ke Virtual Node lainnya!
            
            $dist = self::haversine($lat, $lon, $node->latitude, $node->longitude);
            if ($dist < $minDist) {
                $minDist = $dist;
                $nearestId = $nodeId;
            }
        }

        if ($nearestId !== null) {
            $this->adjacencyList[$id][] = [
                'to' => $nearestId,
                'distance' => $minDist,
                'road' => 'Jalan Kustom (Snap to Graph)'
            ];
            $this->adjacencyList[$nearestId][] = [
                'to' => $id,
                'distance' => $minDist,
                'road' => 'Jalan Kustom (Snap to Graph)'
            ];
        }
    }

    /**
     * Calculate Haversine distance between two coordinates (in km).
     */
    public static function haversine(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $R = 6371; // Earth radius in km
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);

        $a = sin($dLat / 2) * sin($dLat / 2) +
             cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
             sin($dLon / 2) * sin($dLon / 2);

        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return $R * $c;
    }

    /**
     * Uniform Cost Search (UCS)
     * Guarantees optimal path by always expanding the least-cost node.
     */
    public function uniformCostSearch(int $startId, int $goalId): array
    {
        $startTime = microtime(true);
        $nodesVisited = 0;

        // Priority queue: [cost, nodeId, path]
        $frontier = new \SplPriorityQueue();
        $frontier->setExtractFlags(\SplPriorityQueue::EXTR_BOTH);
        $frontier->insert(['cost' => 0, 'node' => $startId, 'path' => [$startId]], 0);

        $explored = [];

        while (!$frontier->isEmpty()) {
            $current = $frontier->extract()['data'];
            $currentNode = $current['node'];
            $currentCost = $current['cost'];
            $currentPath = $current['path'];

            if (isset($explored[$currentNode])) {
                continue;
            }

            $explored[$currentNode] = true;
            $nodesVisited++;

            if ($currentNode === $goalId) {
                $endTime = microtime(true);
                return $this->buildResult(
                    'UCS',
                    $currentPath,
                    $currentCost,
                    $nodesVisited,
                    ($endTime - $startTime) * 1000
                );
            }

            foreach ($this->adjacencyList[$currentNode] ?? [] as $neighbor) {
                if (!isset($explored[$neighbor['to']])) {
                    $newCost = $currentCost + $neighbor['distance'];
                    $newPath = array_merge($currentPath, [$neighbor['to']]);
                    // SplPriorityQueue is max-heap, use negative for min-heap
                    $frontier->insert(
                        ['cost' => $newCost, 'node' => $neighbor['to'], 'path' => $newPath],
                        -$newCost
                    );
                }
            }
        }

        return $this->buildResult('UCS', [], 0, $nodesVisited, (microtime(true) - $startTime) * 1000, false);
    }

    /**
     * A* Search with Haversine heuristic
     * f(n) = g(n) + h(n) where h(n) is the Haversine distance to goal.
     */
    public function aStarSearch(int $startId, int $goalId): array
    {
        $startTime = microtime(true);
        $nodesVisited = 0;

        $goalNode = $this->nodeMap[$goalId];

        $frontier = new \SplPriorityQueue();
        $frontier->setExtractFlags(\SplPriorityQueue::EXTR_BOTH);

        $h = self::haversine(
            $this->nodeMap[$startId]->latitude,
            $this->nodeMap[$startId]->longitude,
            $goalNode->latitude,
            $goalNode->longitude
        );

        $frontier->insert(
            ['g' => 0, 'f' => $h, 'node' => $startId, 'path' => [$startId]],
            -$h
        );

        $explored = [];
        $bestG = [$startId => 0];

        while (!$frontier->isEmpty()) {
            $current = $frontier->extract()['data'];
            $currentNode = $current['node'];
            $currentG = $current['g'];
            $currentPath = $current['path'];

            if (isset($explored[$currentNode])) {
                continue;
            }

            $explored[$currentNode] = true;
            $nodesVisited++;

            if ($currentNode === $goalId) {
                $endTime = microtime(true);
                return $this->buildResult(
                    'A*',
                    $currentPath,
                    $currentG,
                    $nodesVisited,
                    ($endTime - $startTime) * 1000
                );
            }

            foreach ($this->adjacencyList[$currentNode] ?? [] as $neighbor) {
                $neighborId = $neighbor['to'];
                if (isset($explored[$neighborId])) {
                    continue;
                }

                $newG = $currentG + $neighbor['distance'];

                if (!isset($bestG[$neighborId]) || $newG < $bestG[$neighborId]) {
                    $bestG[$neighborId] = $newG;

                    $heuristic = self::haversine(
                        $this->nodeMap[$neighborId]->latitude,
                        $this->nodeMap[$neighborId]->longitude,
                        $goalNode->latitude,
                        $goalNode->longitude
                    );

                    $f = $newG + $heuristic;
                    $newPath = array_merge($currentPath, [$neighborId]);
                    $frontier->insert(
                        ['g' => $newG, 'f' => $f, 'node' => $neighborId, 'path' => $newPath],
                        -$f
                    );
                }
            }
        }

        return $this->buildResult('A*', [], 0, $nodesVisited, (microtime(true) - $startTime) * 1000, false);
    }

    /**
     * Hill Climbing (Steepest Ascent / Greedy Best-First variant)
     * Always moves to the neighbor closest to the goal by Haversine distance.
     * Not guaranteed to find optimal or even any path.
     */
    public function hillClimbing(int $startId, int $goalId): array
    {
        $startTime = microtime(true);
        $nodesVisited = 0;

        $goalNode = $this->nodeMap[$goalId];
        $currentNode = $startId;
        $path = [$startId];
        $totalDistance = 0;
        $visited = [$startId => true];

        while ($currentNode !== $goalId) {
            $nodesVisited++;

            $currentHeuristic = self::haversine(
                $this->nodeMap[$currentNode]->latitude,
                $this->nodeMap[$currentNode]->longitude,
                $goalNode->latitude,
                $goalNode->longitude
            );

            $neighbors = $this->adjacencyList[$currentNode] ?? [];

            if (empty($neighbors)) {
                break;
            }

            $bestNeighbor = null;
            $bestHeuristic = PHP_FLOAT_MAX;
            $bestEdgeDistance = 0;

            foreach ($neighbors as $neighbor) {
                if (isset($visited[$neighbor['to']])) {
                    continue;
                }

                $h = self::haversine(
                    $this->nodeMap[$neighbor['to']]->latitude,
                    $this->nodeMap[$neighbor['to']]->longitude,
                    $goalNode->latitude,
                    $goalNode->longitude
                );

                if ($h < $bestHeuristic) {
                    $bestHeuristic = $h;
                    $bestNeighbor = $neighbor['to'];
                    $bestEdgeDistance = $neighbor['distance'];
                }
            }

            // In Hill Climbing: stop if the best neighbor does not improve (is not closer to the goal than current node)
            if ($bestNeighbor === null || $bestHeuristic >= $currentHeuristic) {
                $endTime = microtime(true);
                return $this->buildResult(
                    'Hill Climbing',
                    $path,
                    $totalDistance,
                    $nodesVisited,
                    ($endTime - $startTime) * 1000,
                    false,
                    $bestNeighbor === null 
                        ? 'Terjebak di lokal optimum (tidak ada tetangga yang belum dikunjungi)' 
                        : 'Terjebak di lokal optimum (semua tetangga lebih jauh dari tujuan)'
                );
            }

            $visited[$bestNeighbor] = true;
            $currentNode = $bestNeighbor;
            $path[] = $bestNeighbor;
            $totalDistance += $bestEdgeDistance;
        }

        if ($currentNode === $goalId) {
            $nodesVisited++;
        }

        $endTime = microtime(true);
        return $this->buildResult(
            'Hill Climbing',
            $path,
            $totalDistance,
            $nodesVisited,
            ($endTime - $startTime) * 1000,
            $currentNode === $goalId
        );
    }

    /**
     * Build a dynamic graph in-memory using real-world OSRM routes and alternatives.
     * This creates a highly detailed, realistic street graph for any coordinates.
     */
    public function buildDynamicGraphFromOSRM(array $start, array $goal): bool
    {
        $latS = (float)$start['lat'];
        $lngS = (float)$start['lng'];
        $latG = (float)$goal['lat'];
        $lngG = (float)$goal['lng'];

        $latMid = ($latS + $latG) / 2;
        $lngMid = ($lngS + $lngG) / 2;

        $dLat = $latG - $latS;
        $dLng = $lngG - $lngS;

        // Perpendicular vector for offset paths: (-dLng, dLat)
        $factor = 0.20; // 20% perpendicular offset for realistic side-streets
        $pLat = -$dLng * $factor;
        $pLng = $dLat * $factor;

        // Calculate 4 helper intermediate coordinates to query detour options
        $p1Lat = $latMid + $pLat;
        $p1Lng = $lngMid + $pLng;

        $p2Lat = $latMid - $pLat;
        $p2Lng = $lngMid - $pLng;

        $p3Lat = $latS + 0.3 * $dLat + 0.5 * $pLat;
        $p3Lng = $lngS + 0.3 * $dLng + 0.5 * $pLng;

        $p4Lat = $latS + 0.7 * $dLat - 0.5 * $pLat;
        $p4Lng = $lngS + 0.7 * $dLng - 0.5 * $pLng;

        // Build OSRM URLs
        $url0 = "https://router.project-osrm.org/route/v1/driving/{$lngS},{$latS};{$lngG},{$latG}?overview=full&geometries=geojson&steps=true&alternatives=true";
        $url1 = "https://router.project-osrm.org/route/v1/driving/{$lngS},{$latS};" . round($p1Lng, 5) . "," . round($p1Lat, 5) . ";{$lngG},{$latG}?overview=full&geometries=geojson&steps=true";
        $url2 = "https://router.project-osrm.org/route/v1/driving/{$lngS},{$latS};" . round($p2Lng, 5) . "," . round($p2Lat, 5) . ";{$lngG},{$latG}?overview=full&geometries=geojson&steps=true";
        $url3 = "https://router.project-osrm.org/route/v1/driving/{$lngS},{$latS};" . round($p3Lng, 5) . "," . round($p3Lat, 5) . ";{$lngG},{$latG}?overview=full&geometries=geojson&steps=true";
        $url4 = "https://router.project-osrm.org/route/v1/driving/{$lngS},{$latS};" . round($p4Lng, 5) . "," . round($p4Lat, 5) . ";{$lngG},{$latG}?overview=full&geometries=geojson&steps=true";

        try {
            // Concurrent requests to build the network pool in under 1 second
            $responses = \Illuminate\Support\Facades\Http::pool(fn ($pool) => [
                $pool->as('r0')->withOptions(['verify' => false])->timeout(4)->get($url0),
                $pool->as('r1')->withOptions(['verify' => false])->timeout(4)->get($url1),
                $pool->as('r2')->withOptions(['verify' => false])->timeout(4)->get($url2),
                $pool->as('r3')->withOptions(['verify' => false])->timeout(4)->get($url3),
                $pool->as('r4')->withOptions(['verify' => false])->timeout(4)->get($url4),
            ]);

            $allRoutes = [];
            foreach ($responses as $res) {
                if ($res->successful()) {
                    $resData = $res->json();
                    if (!empty($resData['routes'])) {
                        foreach ($resData['routes'] as $r) {
                            $allRoutes[] = $r;
                        }
                    }
                }
            }

            if (empty($allRoutes)) {
                return false;
            }

            // Reset graph arrays for this dynamic query
            $this->adjacencyList = [];
            $this->nodeMap = [];

            $startId = -1;
            $goalId = -2;

            // Register Start and Goal
            $this->nodeMap[$startId] = (object)[
                'id' => $startId,
                'name' => $start['name'],
                'latitude' => $latS,
                'longitude' => $lngS
            ];
            $this->adjacencyList[$startId] = [];

            $this->nodeMap[$goalId] = (object)[
                'id' => $goalId,
                'name' => $goal['name'],
                'latitude' => $latG,
                'longitude' => $lngG
            ];
            $this->adjacencyList[$goalId] = [];

            $virtualId = 1;
            $nodeCoordinates = [];

            // Add start/goal coordinates map
            $startKey = round($latS, 5) . ',' . round($lngS, 5);
            $goalKey = round($latG, 5) . ',' . round($lngG, 5);
            $nodeCoordinates[$startKey] = $startId;
            $nodeCoordinates[$goalKey] = $goalId;

            // Loop through each route option to build our nodes and edges
            foreach ($allRoutes as $route) {
                if (empty($route['legs'])) continue;

                $prevNodeId = $startId;

                foreach ($route['legs'] as $leg) {
                    if (empty($leg['steps'])) continue;

                    foreach ($leg['steps'] as $step) {
                        $loc = $step['maneuver']['location'] ?? null;
                        if (!$loc || count($loc) < 2) continue;

                        $lat = (float)$loc[1];
                        $lng = (float)$loc[0];
                        $streetName = trim($step['name'] ?? '');
                        if ($streetName === '') {
                            $streetName = "Jalan Raya";
                        }

                        $coordKey = round($lat, 5) . ',' . round($lng, 5);

                        if (isset($nodeCoordinates[$coordKey])) {
                            $nodeId = $nodeCoordinates[$coordKey];
                        } else {
                            $nodeId = $virtualId++;
                            $nodeCoordinates[$coordKey] = $nodeId;

                            $this->nodeMap[$nodeId] = (object)[
                                'id' => $nodeId,
                                'name' => $streetName,
                                'latitude' => $lat,
                                'longitude' => $lng
                            ];
                            $this->adjacencyList[$nodeId] = [];
                        }

                        if ($prevNodeId !== $nodeId) {
                            $dist = self::haversine(
                                $this->nodeMap[$prevNodeId]->latitude,
                                $this->nodeMap[$prevNodeId]->longitude,
                                $lat,
                                $lng
                            );
                            $this->addEdge($prevNodeId, $nodeId, $dist, $streetName);
                        }

                        $prevNodeId = $nodeId;
                    }
                }

                // Connect the last node of the leg to the Goal
                if ($prevNodeId !== $goalId) {
                    $dist = self::haversine(
                        $this->nodeMap[$prevNodeId]->latitude,
                        $this->nodeMap[$prevNodeId]->longitude,
                        $latG,
                        $lngG
                    );
                    $this->addEdge($prevNodeId, $goalId, $dist, $goal['name']);
                }
            }

            // Create intersection connections between paths (nodes within 80m) to allow path switching/switching
            $nodeIds = array_keys($this->nodeMap);
            $count = count($nodeIds);
            for ($i = 0; $i < $count; $i++) {
                for ($j = $i + 1; $j < $count; $j++) {
                    $id1 = $nodeIds[$i];
                    $id2 = $nodeIds[$j];

                    if ($id1 <= 0 && $id2 <= 0) continue; // Skip start-goal direct link

                    $n1 = $this->nodeMap[$id1];
                    $n2 = $this->nodeMap[$id2];

                    $dist = self::haversine($n1->latitude, $n1->longitude, $n2->latitude, $n2->longitude);
                    if ($dist < 0.08) { // 80 meters
                        // Connect if not already connected
                        $connected = false;
                        foreach ($this->adjacencyList[$id1] as $edge) {
                            if ($edge['to'] === $id2) {
                                $connected = true;
                                break;
                            }
                        }
                        if (!$connected) {
                            $this->addEdge($id1, $id2, $dist, 'Persimpangan Penghubung');
                        }
                    }
                }
            }

            return true;
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::warning("Dynamic graph building failed: " . $e->getMessage());
            return false;
        }
    }

    /**
     * Add bidirectional edge
     */
    private function addEdge(int $from, int $to, float $dist, string $road): void
    {
        $this->adjacencyList[$from][] = [
            'to' => $to,
            'distance' => $dist,
            'road' => $road
        ];
        $this->adjacencyList[$to][] = [
            'to' => $from,
            'distance' => $dist,
            'road' => $road
        ];
    }

    /**
     * Build a standardized result array.
     */
    private function buildResult(
        string $algorithm,
        array $pathIds,
        float $totalDistance,
        int $nodesVisited,
        float $executionTimeMs,
        bool $found = true,
        string $message = ''
    ): array {
        $pathDetails = [];
        foreach ($pathIds as $nodeId) {
            if (isset($this->nodeMap[$nodeId])) {
                $node = $this->nodeMap[$nodeId];
                $pathDetails[] = [
                    'id' => $node->id,
                    'name' => $node->name,
                    'latitude' => $node->latitude,
                    'longitude' => $node->longitude,
                ];
            }
        }

        return [
            'algorithm' => $algorithm,
            'found' => $found,
            'path' => $pathDetails,
            'total_distance_km' => round($totalDistance, 2),
            'nodes_visited' => $nodesVisited,
            'execution_time_ms' => round($executionTimeMs, 3),
            'path_length' => count($pathDetails),
            'message' => $message,
        ];
    }
}
