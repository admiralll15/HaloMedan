<?php

use App\Http\Controllers\RouteController;
use Illuminate\Support\Facades\Route;

Route::get('/', [RouteController::class, 'index'])->name('route.index');
Route::post('/api/calculate', [RouteController::class, 'calculate'])->name('route.calculate');
Route::get('/api/search-location', [RouteController::class, 'searchLocation'])->name('route.search');
