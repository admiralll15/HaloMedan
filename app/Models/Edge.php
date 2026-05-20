<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Edge extends Model
{
    protected $fillable = ['node_from', 'node_to', 'distance_km', 'road_name'];

    protected $casts = [
        'distance_km' => 'float',
    ];

    /**
     * Get the origin node.
     */
    public function fromNode(): BelongsTo
    {
        return $this->belongsTo(Node::class, 'node_from');
    }

    /**
     * Get the destination node.
     */
    public function toNode(): BelongsTo
    {
        return $this->belongsTo(Node::class, 'node_to');
    }
}
