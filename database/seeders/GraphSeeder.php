<?php

namespace Database\Seeders;

use App\Models\Node;
use App\Models\Edge;
use Illuminate\Database\Seeder;

class GraphSeeder extends Seeder
{
    /**
     * Seed the graph with real geographic data for Medan city.
     */
    public function run(): void
    {
        // Clear existing tables to avoid duplicate key or integrity issues
        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();
        Edge::truncate();
        Node::truncate();
        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();

        // ===== NODES (Medan City Districts/Landmarks) =====
        $nodesData = [
            // Major Medan landmarks and junctions
            ['name' => 'Medan Pusat (Lapangan Merdeka)',  'latitude' => 3.5912,  'longitude' => 98.6781],
            ['name' => 'Medan Tembung (Unimed)',          'latitude' => 3.6190,  'longitude' => 98.7153],
            ['name' => 'Medan Baru (USU)',                'latitude' => 3.5645,  'longitude' => 98.6560],
            ['name' => 'Medan Petisah (Medan Fair)',      'latitude' => 3.5932,  'longitude' => 98.6638],
            ['name' => 'Medan Kota (Stadion Teladan)',    'latitude' => 3.5670,  'longitude' => 98.6905],
            ['name' => 'Medan Timur (Pulo Brayan)',       'latitude' => 3.6268,  'longitude' => 98.6775],
            ['name' => 'Medan Helvetia (Millennium)',     'latitude' => 3.6015,  'longitude' => 98.6472],
            ['name' => 'Medan Sunggal (Simpang Sunggal)',  'latitude' => 3.5788,  'longitude' => 98.6215],
            ['name' => 'Medan Johor (Simpang Pos)',       'latitude' => 3.5283,  'longitude' => 98.6472],
            ['name' => 'Medan Area (Sukaramai)',          'latitude' => 3.5815,  'longitude' => 98.6975],
            ['name' => 'Medan Denai (Simpang Limun)',     'latitude' => 3.5535,  'longitude' => 98.7055],
            ['name' => 'Medan Maimun (Istana Maimun)',    'latitude' => 3.5750,  'longitude' => 98.6835],
            ['name' => 'Medan Amplas (Terminal Amplas)',  'latitude' => 3.5350,  'longitude' => 98.7205],
            ['name' => 'Medan Labuhan (Cemara Asri)',     'latitude' => 3.6385,  'longitude' => 98.6975],
            // New Landmark Nodes to create path alternatives
            ['name' => 'Podomoro City',                   'latitude' => 3.5975,  'longitude' => 98.6742],
            ['name' => 'Stasiun Medan',                   'latitude' => 3.5901,  'longitude' => 98.6796],
            ['name' => 'Center Point Mall',               'latitude' => 3.5925,  'longitude' => 98.6808],
            ['name' => 'Tjong A Fie Mansion',             'latitude' => 3.5878,  'longitude' => 98.6787],
            ['name' => 'Simpang Kampus USU',              'latitude' => 3.5612,  'longitude' => 98.6543],
            ['name' => 'Flyover Jamin Ginting',           'latitude' => 3.5312,  'longitude' => 98.6468],
            ['name' => 'Hermes Place Polonia',            'latitude' => 3.5658,  'longitude' => 98.6715],
            ['name' => 'Medan Club',                      'latitude' => 3.5812,  'longitude' => 98.6685],
            ['name' => 'Sun Plaza',                       'latitude' => 3.5847,  'longitude' => 98.6717],
        ];

        $nodes = [];
        foreach ($nodesData as $data) {
            $nodes[$data['name']] = Node::create([
                'name' => $data['name'],
                'latitude' => $data['latitude'],
                'longitude' => $data['longitude'],
                'is_city' => true,
            ]);
        }

        // ===== EDGES (Road connections within Medan) =====
        $edgesData = [
            // Center & North Links
            ['Medan Pusat (Lapangan Merdeka)',  'Stasiun Medan',                   0.3,  'Jl. Stasiun'],
            ['Medan Pusat (Lapangan Merdeka)',  'Tjong A Fie Mansion',             0.5,  'Jl. Ahmad Yani'],
            ['Medan Pusat (Lapangan Merdeka)',  'Podomoro City',                   0.8,  'Jl. Putri Hijau'],
            ['Medan Pusat (Lapangan Merdeka)',  'Center Point Mall',               0.4,  'Jl. Jawa'],
            ['Medan Pusat (Lapangan Merdeka)',  'Medan Petisah (Medan Fair)',      1.8,  'Jl. Gatot Subroto'],
            ['Medan Pusat (Lapangan Merdeka)',  'Medan Tembung (Unimed)',          5.2,  'Jl. HM Yamin'],
            
            // Podomoro City Links
            ['Podomoro City',                   'Medan Petisah (Medan Fair)',      1.2,  'Jl. Guru Patimpus'],
            ['Podomoro City',                   'Medan Helvetia (Millennium)',     2.2,  'Jl. Kapten Muslim'],
            ['Podomoro City',                   'Stasiun Medan',                   0.9,  'Jl. Putri Hijau'],
            
            // Medan Fair & Sun Plaza Links
            ['Medan Petisah (Medan Fair)',      'Sun Plaza',                       1.0,  'Jl. H. Zainul Arifin'],
            ['Medan Petisah (Medan Fair)',      'Medan Helvetia (Millennium)',     2.5,  'Jl. Gatot Subroto'],
            ['Medan Petisah (Medan Fair)',      'Medan Sunggal (Simpang Sunggal)',  4.2,  'Jl. Gatot Subroto'],
            ['Medan Petisah (Medan Fair)',      'Medan Club',                      1.5,  'Jl. Kartini'],
            
            // Sun Plaza & Hermes Links
            ['Sun Plaza',                       'Medan Club',                      0.6,  'Jl. Diponegoro'],
            ['Sun Plaza',                       'Hermes Place Polonia',            2.2,  'Jl. Mongonsidi'],
            ['Sun Plaza',                       'Tjong A Fie Mansion',             1.2,  'Jl. KH Wahid Hasyim'],
            
            // USU & Simpang Kampus Links
            ['Medan Baru (USU)',                'Simpang Kampus USU',              0.4,  'Jl. Dr. Mansyur'],
            ['Medan Baru (USU)',                'Medan Sunggal (Simpang Sunggal)',  4.0,  'Jl. Ringroad'],
            ['Medan Baru (USU)',                'Medan Club',                      1.8,  'Jl. Pabrik Tenun'],
            ['Medan Baru (USU)',                'Hermes Place Polonia',            1.5,  'Jl. Jamin Ginting'],
            
            // Simpang Kampus & Jamin Ginting Links
            ['Simpang Kampus USU',              'Medan Johor (Simpang Pos)',       4.1,  'Jl. Jamin Ginting'],
            ['Simpang Kampus USU',              'Flyover Jamin Ginting',           4.3,  'Jl. Jamin Ginting'],
            
            // Simpang Pos & Flyover Links
            ['Medan Johor (Simpang Pos)',       'Flyover Jamin Ginting',           0.3,  'Jl. AH Nasution'],
            ['Medan Johor (Simpang Pos)',       'Medan Amplas (Terminal Amplas)',  7.5,  'Jl. AH Nasution'],
            ['Medan Johor (Simpang Pos)',       'Medan Denai (Simpang Limun)',     6.5,  'Jl. AH Nasution'],
            
            // East & South Links
            ['Center Point Mall',               'Medan Timur (Pulo Brayan)',       3.8,  'Jl. Yos Sudarso'],
            ['Center Point Mall',               'Medan Tembung (Unimed)',          5.0,  'Jl. HM Yamin'],
            
            ['Medan Tembung (Unimed)',          'Medan Timur (Pulo Brayan)',       4.5,  'Jl. Cemara'],
            ['Medan Tembung (Unimed)',          'Medan Area (Sukaramai)',          4.8,  'Jl. Letda Sujono'],
            ['Medan Tembung (Unimed)',          'Medan Labuhan (Cemara Asri)',     3.5,  'Jl. Cemara Raya'],
            
            ['Medan Area (Sukaramai)',          'Medan Kota (Stadion Teladan)',    2.2,  'Jl. Halat'],
            ['Medan Area (Sukaramai)',          'Medan Denai (Simpang Limun)',     2.8,  'Jl. Bakti'],
            ['Medan Area (Sukaramai)',          'Medan Maimun (Istana Maimun)',    1.8,  'Jl. Amaliun'],
            
            ['Medan Kota (Stadion Teladan)',    'Medan Maimun (Istana Maimun)',    1.2,  'Jl. Brigjend Katamso'],
            ['Medan Kota (Stadion Teladan)',    'Medan Denai (Simpang Limun)',     2.0,  'Jl. Sisingamangaraja'],
            
            ['Medan Denai (Simpang Limun)',     'Medan Amplas (Terminal Amplas)',  3.0,  'Jl. Sisingamangaraja'],
            ['Medan Helvetia (Millennium)',     'Medan Sunggal (Simpang Sunggal)',  3.8,  'Jl. Kapten Muslim'],
            ['Medan Labuhan (Cemara Asri)',     'Medan Timur (Pulo Brayan)',       3.2,  'Jl. Krakatau'],
        ];

        foreach ($edgesData as $data) {
            Edge::create([
                'node_from' => $nodes[$data[0]]->id,
                'node_to' => $nodes[$data[1]]->id,
                'distance_km' => $data[2],
                'road_name' => $data[3],
            ]);
        }
    }
}
