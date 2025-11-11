/**
 * Watchlist Routes Index
 *
 * Combines all watchlist route modules into a single router.
 * This provides a drop-in replacement for the monolithic watchlist.js file.
 *
 * Module Structure:
 * - crud.js: List, get, create, update, delete, clone operations
 * - csv.js: CSV import/export operations
 * - instances.js: Instance assignment operations
 */

import express from 'express';
import crudRoutes from './crud.js';
import csvRoutes from './csv.js';
import instanceRoutes from './instances.js';

const router = express.Router();

// Mount CRUD routes (/, /:id, etc.)
router.use('/', crudRoutes);

// Mount CSV routes (/:id/export, /:id/import)
router.use('/', csvRoutes);

// Mount instance routes (/:id/instances)
router.use('/', instanceRoutes);

export default router;
