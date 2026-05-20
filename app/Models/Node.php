<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Node extends Model
{
    protected $fillable = ['name', 'latitude', 'longitude', 'is_city'];

    protected $casts = [
        'latitude' => 'float',
        'longitude' => 'float',
        'is_city' => 'boolean',
    ];

    /**
     * Get edges originating from this node.
     */
    public function edgesFrom(): HasMany
    {
        return $this->hasMany(Edge::class, 'node_from');
    }

    /**
     * Get edges ending at this node.
     */
    public function edgesTo(): HasMany
    {
        return $this->hasMany(Edge::class, 'node_to');
    }

    /**
     * Get all neighbors of this node (bidirectional).
     */
    public function getNeighbors(): array
    {
        $neighbors = [];

        foreach ($this->edgesFrom as $edge) {
            $neighbors[] = [
                'node' => $edge->toNode,
                'distance' => $edge->distance_km,
                'road' => $edge->road_name,
            ];
        }

        foreach ($this->edgesTo as $edge) {
            $neighbors[] = [
                'node' => $edge->fromNode,
                'distance' => $edge->distance_km,
                'road' => $edge->road_name,
            ];
        }

        return $neighbors;
    }
}
