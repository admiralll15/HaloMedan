<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('edges', function (Blueprint $table) {
            $table->id();
            $table->foreignId('node_from')->constrained('nodes')->onDelete('cascade');
            $table->foreignId('node_to')->constrained('nodes')->onDelete('cascade');
            $table->decimal('distance_km', 8, 2);
            $table->string('road_name')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('edges');
    }
};
