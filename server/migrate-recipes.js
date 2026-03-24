/**
 * Migrate recipes from data-v2.js to PostgreSQL
 * Run once: node migrate-recipes.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Copy recipe data inline (extracted from data-v2.js)
const RECIPES = {};

// We'll load data-v2.js in a browser-like way
const fs = require('fs');
const code = fs.readFileSync(__dirname + '/data-v2.js', 'utf8');

// Extract just the RECIPES assignments
const lines = code.split('\n');
let recipeCode = 'const RECIPES = {};\n';
let inRecipe = false;
for (const line of lines) {
    if (line.startsWith("RECIPES['") || line.startsWith('RECIPES["')) {
        inRecipe = true;
    }
    if (inRecipe) {
        recipeCode += line + '\n';
        if (line.startsWith('};')) {
            inRecipe = false;
        }
    }
}
recipeCode += '\nmodule.exports = RECIPES;';

// Write temp file and require it
const tmpPath = __dirname + '/_recipes_tmp.js';
fs.writeFileSync(tmpPath, recipeCode);
const recipes = require(tmpPath);

async function migrate() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let count = 0;
        for (const [id, r] of Object.entries(recipes)) {
            await client.query(`
                INSERT INTO recipes (id, cat, name, emoji, time_min, difficulty, servings, is_free,
                    kcal, protein, fat, carbs, fiber, tags, photo, img_position, quote,
                    ingredients, steps, note, vk_video, add_protein, add_fat, add_carbs, add_fiber, sort_order)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
                ON CONFLICT (id) DO UPDATE SET
                    cat=EXCLUDED.cat, name=EXCLUDED.name, emoji=EXCLUDED.emoji,
                    time_min=EXCLUDED.time_min, difficulty=EXCLUDED.difficulty,
                    servings=EXCLUDED.servings, is_free=EXCLUDED.is_free,
                    kcal=EXCLUDED.kcal, protein=EXCLUDED.protein, fat=EXCLUDED.fat,
                    carbs=EXCLUDED.carbs, fiber=EXCLUDED.fiber, tags=EXCLUDED.tags,
                    photo=EXCLUDED.photo, img_position=EXCLUDED.img_position,
                    quote=EXCLUDED.quote, ingredients=EXCLUDED.ingredients,
                    steps=EXCLUDED.steps, note=EXCLUDED.note, vk_video=EXCLUDED.vk_video,
                    add_protein=EXCLUDED.add_protein, add_fat=EXCLUDED.add_fat,
                    add_carbs=EXCLUDED.add_carbs, add_fiber=EXCLUDED.add_fiber,
                    sort_order=EXCLUDED.sort_order, updated_at=now()
            `, [
                id, r.cat, r.name, r.emoji || '🍴', r.time || 30, r.diff || 'easy',
                r.servings || 2, r.free || false,
                r.kcal || 0, r.protein || 0, r.fat || 0, r.carbs || 0, r.fiber || 0,
                r.tags || [], r.photo || null, r.imgPosition || null, r.quote || null,
                JSON.stringify(r.ingredients || []), JSON.stringify(r.steps || []),
                r.note || null, r.vkVideo || null,
                JSON.stringify(r.addProtein || []), JSON.stringify(r.addFat || []),
                JSON.stringify(r.addCarbs || []), JSON.stringify(r.addFiber || []),
                count
            ]);
            count++;
            console.log(`  ✓ ${id}`);
        }
        await client.query('COMMIT');
        console.log(`\nMigrated ${count} recipes`);
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', e);
    } finally {
        client.release();
        pool.end();
        try { fs.unlinkSync(tmpPath); } catch {}
    }
}

migrate();
