
// ============================================================
// NINIT0 / NINI TO
// CLOUDFLARE WORKER API
// ============================================================
//
// Worker Name:
// ninitoapp
//
// Cloudflare D1 Database:
// ninitodb
//
// D1 Binding:
// DB
//
// GitHub Repository:
// farzadclever88/binini
//
// SYSTEM SCOPE
// ------------------------------------------------------------
// Product
//      ↓
// BOM
//      ↓
// BOM Details / Parts
//      ↓
// Raw Material Warehouse
//      ↓
// Production Planning
//      ↓
// Production
//      ↓
// Material Consumption
//      ↓
// Finished Product Warehouse
//
// NOT INCLUDED YET
// ------------------------------------------------------------
// Store
// Sales
// Customers
// Orders
// Delivery
// Shipping
//
// ============================================================


// ============================================================
// CONFIGURATION
// ============================================================
const APP_NAME = "NiniTo";

const APP_VERSION = "1.0.0";

const API_VERSION = "1.0.0";

const WORKER_NAME = "ninitoapp";

const DATABASE_NAME = "ninitodb";


// Session duration
// 12 hours

const SESSION_HOURS = 12;


// ============================================================
// RESPONSE HELPERS
// ============================================================

function responseHeaders(origin = "*") {

    return {

        "Content-Type":
            "application/json; charset=UTF-8",

        "Cache-Control":
            "no-store",

        "Access-Control-Allow-Origin":
            origin,

        "Access-Control-Allow-Headers":
            "Content-Type, Authorization",

        "Access-Control-Allow-Methods":
            "GET, POST, PUT, DELETE, OPTIONS",

        "Access-Control-Max-Age":
            "86400"

    };

}


function jsonResponse(
    payload,
    status = 200,
    origin = "*"
) {

    return new Response(

        JSON.stringify(payload),

        {

            status,

            headers:
                responseHeaders(origin)

        }

    );

}


function successResponse(
    data = {},
    status = 200,
    origin = "*"
) {

    return jsonResponse(

        {

            success: true,

            ...data

        },

        status,

        origin

    );

}


function errorResponse(
    code,
    message,
    status = 400,
    details = null,
    origin = "*"
) {

    return jsonResponse(

        {

            success: false,

            error: {

                code,

                message,

                details

            }

        },

        status,

        origin

    );

}


// ============================================================
// CONTROLLED ERROR
// ============================================================

class AppError extends Error {

    constructor(
        code,
        message,
        status = 400,
        details = null
    ) {

        super(message);

        this.code =
            code;

        this.status =
            status;

        this.details =
            details;

    }

}


// ============================================================
// HASH
// ============================================================

async function sha256(value) {

    const data =
        new TextEncoder()
            .encode(
                String(value)
            );

    const hash =
        await crypto.subtle.digest(
            "SHA-256",
            data
        );

    return Array
        .from(
            new Uint8Array(hash)
        )
        .map(
            byte =>
                byte
                    .toString(16)
                    .padStart(2, "0")
        )
        .join("");

}


// ============================================================
// RANDOM TOKEN
// ============================================================

function generateToken() {

    const bytes =
        new Uint8Array(32);

    crypto.getRandomValues(
        bytes
    );

    return Array
        .from(bytes)
        .map(
            byte =>
                byte
                    .toString(16)
                    .padStart(2, "0")
        )
        .join("");

}
// ============================================================
// GET PRODUCTION LIST
// ============================================================

async function getProductionList(
    env
) {

    const result =
        await env.DB
            .prepare(`

                SELECT

                    pr.id,

                    pr.product_id,

                    p.code AS product_code,

                    p.name AS product_name,

                    p.unit_id,

                    pr.planning_daily_id,

                    pd.plan_date,

                    pd.bom_id,

                    pd.planned_quantity,

                    bh.code AS bom_code,

                    bh.version AS bom_version,

                    bh.status AS bom_status,

                    pr.produced_quantity,

                    pr.production_date,

                    pr.status,

                    pr.created_by,

                    pr.created_at

                FROM production pr

                LEFT JOIN products p

                    ON p.id =
                       pr.product_id

                LEFT JOIN planning_daily pd

                    ON pd.id =
                       pr.planning_daily_id

                LEFT JOIN bom_headers bh

                    ON bh.id =
                       pd.bom_id

                ORDER BY

                    pr.id DESC

            `)

            .all();


    return result.results || [];

}

// ============================================================
// JSON BODY
// ============================================================

async function readJson(request) {

    try {

        return await request.json();

    }

    catch {

        throw new AppError(

            "REQ-001",

            "اطلاعات ارسالی معتبر نیست.",

            400

        );

    }

}


// ============================================================
// BASIC VALIDATORS
// ============================================================

function requiredText(
    value,
    fieldName,
    code
) {

    const text =
        String(value ?? "")
            .trim();

    if (!text) {

        throw new AppError(

            code,

            `${fieldName} الزامی است.`,

            400

        );

    }

    return text;

}


function positiveNumber(
    value,
    fieldName,
    code
) {

    const number =
        Number(value);

    if (
        !Number.isFinite(number) ||
        number <= 0
    ) {

        throw new AppError(

            code,

            `${fieldName} باید عددی بزرگ‌تر از صفر باشد.`,

            400

        );

    }

    return number;

}


function nonNegativeNumber(
    value,
    fieldName,
    code
) {

    const number =
        Number(value);

    if (
        !Number.isFinite(number) ||
        number < 0
    ) {

        throw new AppError(

            code,

            `${fieldName} باید عدد صفر یا بزرگ‌تر باشد.`,

            400

        );

    }

    return number;

}


function positiveId(
    value,
    fieldName,
    code
) {

    const id =
        Number(value);

    if (
        !Number.isInteger(id) ||
        id <= 0
    ) {

        throw new AppError(

            code,

            `${fieldName} معتبر نیست.`,

            400

        );

    }

    return id;

}


// ============================================================
// DATE VALIDATION
// ============================================================
//
// Frontend will send Persian date:
//
// 1405/05/31
//
// Worker keeps it as text because D1 does not natively
// understand Persian calendar.
//
// ============================================================

function validatePersianDate(
    value,
    fieldName = "تاریخ",
    code = "DATE-001"
) {

    const date =
        String(value ?? "")
            .trim();

    const pattern =
        /^\d{4}\/\d{2}\/\d{2}$/;

    if (!pattern.test(date)) {

        throw new AppError(

            code,

            `${fieldName} باید به شکل 1405/05/31 وارد شود.`,

            400

        );

    }

    const parts =
        date.split("/");

    const year =
        Number(parts[0]);

    const month =
        Number(parts[1]);

    const day =
        Number(parts[2]);

    if (
        year < 1300 ||
        year > 1600 ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31
    ) {

        throw new AppError(

            code,

            `${fieldName} معتبر نیست.`,

            400

        );

    }

    return date;

}


// ============================================================
// AUTHORIZATION HEADER
// ============================================================

function getBearerToken(request) {

    const header =
        request.headers.get(
            "Authorization"
        ) || "";

    if (
        !header.startsWith(
            "Bearer "
        )
    ) {

        return null;

    }

    return header
        .substring(7)
        .trim();

}


// ============================================================
// AUTHENTICATION
// ============================================================

async function authenticate(
    request,
    env
) {

    const token =
        getBearerToken(
            request
        );

    if (!token) {

        throw new AppError(

            "AUTH-001",

            "برای انجام این عملیات باید وارد سیستم شوید.",

            401

        );

    }

    const tokenHash =
        await sha256(token);

    const user =
        await env.DB
            .prepare(`

                SELECT

                    u.id,

                    u.username,

                    u.full_name,

                    u.email,

                    u.role,

                    u.status

                FROM user_sessions s

                INNER JOIN users u

                    ON u.id = s.user_id

                WHERE

                    s.token_hash = ?

                    AND

                    s.expires_at >
                    datetime('now')

                    AND

                    u.status = 'active'

                LIMIT 1

            `)

            .bind(
                tokenHash
            )

            .first();

    if (!user) {

        throw new AppError(

            "AUTH-002",

            "نشست شما معتبر نیست یا منقضی شده است. لطفاً دوباره وارد شوید.",

            401

        );

    }

    return user;

}


// ============================================================
// ROLE CHECK
// ============================================================

function requireRole(
    user,
    roles
) {

    if (!Array.isArray(roles)) {

        roles = [roles];

    }

    if (
        !roles.includes(
            user.role
        )
    ) {

        throw new AppError(

            "AUTH-003",

            "شما مجوز انجام این عملیات را ندارید.",

            403

        );

    }

}


// ============================================================
// AUDIT LOG
// ============================================================

async function writeAudit(
    env,
    userId,
    action,
    entity,
    entityId = null,
    details = null
) {

    try {

        await env.DB
            .prepare(`

                INSERT INTO audit_logs
                (

                    user_id,

                    action,

                    entity,

                    entity_id,

                    details

                )

                VALUES

                (?, ?, ?, ?, ?)

            `)

            .bind(

                userId || null,

                action,

                entity || null,

                entityId || null,

                details
                    ? JSON.stringify(
                        details
                    )
                    : null

            )

            .run();

    }

    catch (error) {

        console.error(
            "AUDIT_ERROR",
            error
        );

    }

}


// ============================================================
// GENERIC DATABASE ERROR
// ============================================================

function databaseError(
    error,
    defaultCode,
    defaultMessage
) {

    console.error(
        "DATABASE_ERROR",
        error
    );

    const message =
        String(
            error?.message || ""
        );

    if (
        message.includes(
            "UNIQUE"
        )
    ) {

        return new AppError(

            `${defaultCode}-UNIQUE`,

            "اطلاعات واردشده تکراری است.",

            409

        );

    }

    if (
        message.includes(
            "FOREIGN KEY"
        )
    ) {

        return new AppError(

            `${defaultCode}-FK`,

            "یکی از اطلاعات مرتبط پیدا نشد یا قابل استفاده نیست.",

            409

        );

    }

    return new AppError(

        defaultCode,

        defaultMessage,

        500

    );

}
// ============================================================
// LOOKUP / DROPDOWN APIs
// ============================================================


// ============================================================
// UNITS
// ============================================================

async function getUnits(
    env
) {

    const result =
        await env.DB
            .prepare(`

                SELECT

                    id,

                    code,

                    name,

                    status

                FROM units

                WHERE status = 'active'

                ORDER BY name

            `)
            .all();

    return result.results;

}


// ============================================================
// PRODUCTS
// ============================================================

async function getProducts(
    env
) {

    const result =
        await env.DB
            .prepare(`

                SELECT

                    p.id,

                    p.code,

                    p.name,

                    p.unit_id,

                    u.name AS unit_name,

                    p.status

                FROM products p

                INNER JOIN units u

                    ON u.id = p.unit_id

                WHERE
                    p.status = 'active'

                ORDER BY
                    p.name

            `)
            .all();

    return result.results;

}


// ============================================================
// PARTS
// ============================================================

async function getParts(
    env
) {

    const result =
        await env.DB
            .prepare(`

                SELECT

                    p.id,

                    p.code,

                    p.name,

                    p.unit_id,

                    u.name AS unit_name,

                    p.barcode,

                    p.min_stock,

                    p.reorder_point,

                    p.status

                FROM parts p

                INNER JOIN units u

                    ON u.id = p.unit_id

                WHERE
                    p.status = 'active'

                ORDER BY
                    p.name

            `)
            .all();

    return result.results;

}


// ============================================================
// WAREHOUSES
// ============================================================

async function getWarehouses(
    env
) {

    const result =
        await env.DB
            .prepare(`

                SELECT

                    id,

                    code,

                    name,

                    warehouse_type,

                    status

                FROM warehouses

                WHERE
                    status = 'active'

                ORDER BY
                    name

            `)
            .all();

    return result.results;

}


// ============================================================
// BOM LIST
// ============================================================

async function getBoms(
    env
) {

    const result =
        await env.DB
            .prepare(`

                SELECT

                    b.id,

                    b.code,

                    b.product_id,

                    p.code AS product_code,

                    p.name AS product_name,

                    b.version,

                    b.effective_from,

                    b.effective_to,

                    b.status

                FROM bom_headers b

                INNER JOIN products p

                    ON p.id =
                       b.product_id

                ORDER BY

                    p.name,

                    b.version DESC

            `)
            .all();

    return result.results;

}

// ============================================================
// BOM DETAILS
// ============================================================

async function getBomDetails(
    env,
    bomId
) {

    const id =
        positiveId(
            bomId,
            "شناسه BOM",
            "BOM-001"
        );

    const result =
        await env.DB
            .prepare(`

                SELECT

                    d.id,

                    d.bom_id,

                    d.part_id,

                    p.code AS part_code,

                    p.name AS part_name,

                    p.barcode,

                    u.name AS unit_name,

                    d.consumption_factor,

                    d.scrap_percent,

                    d.status,

                    COALESCE(
                        (
                            SELECT
                                SUM(
                                    ib.quantity
                                )

                            FROM inventory_balances ib

                            INNER JOIN warehouses w

                                ON w.id =
                                   ib.warehouse_id

                            WHERE

                                ib.item_type =
                                'part'

                                AND

                                ib.item_id =
                                d.part_id

                                AND

                                w.warehouse_type =
                                'material'

                                AND

                                w.status =
                                'active'

                        ),
                        0
                    ) AS inventory_quantity

                FROM bom_details d

                INNER JOIN parts p

                    ON p.id =
                       d.part_id

                INNER JOIN units u

                    ON u.id =
                       p.unit_id

                WHERE

                    d.bom_id = ?

                ORDER BY

                    d.id

            `)

            .bind(id)

            .all();

    return result.results;

}

// ============================================================
// BARCODE SEARCH
// ============================================================

async function findPartByBarcode(
    env,
    barcode
) {

    const value =
        requiredText(
            barcode,
            "بارکد",
            "BARCODE-001"
        );

    const part =
        await env.DB
            .prepare(`

                SELECT

                    p.id,

                    p.code,

                    p.name,

                    p.barcode,

                    p.unit_id,

                    u.name AS unit_name,

                    p.min_stock,

                    p.reorder_point

                FROM parts p

                INNER JOIN units u

                    ON u.id =
                       p.unit_id

                WHERE

                    p.barcode = ?

                    AND

                    p.status = 'active'

                LIMIT 1

            `)

            .bind(value)

            .first();

    if (!part) {

        throw new AppError(

            "BARCODE-002",

            "قطعه‌ای با این بارکد پیدا نشد.",

            404

        );

    }

    return part;

}


// ============================================================
// INVENTORY
// ============================================================

async function getInventory(
    env,
    filters = {}
) {

    let sql = `

        SELECT

            i.id,

            i.warehouse_id,

            w.code AS warehouse_code,

            w.name AS warehouse_name,

            i.item_type,

            i.item_id,

            CASE

                WHEN
                    i.item_type = 'part'

                THEN
                    (

                        SELECT
                            name

                        FROM parts

                        WHERE
                            id =
                            i.item_id

                    )

                WHEN
                    i.item_type = 'product'

                THEN
                    (

                        SELECT
                            name

                        FROM products

                        WHERE
                            id =
                            i.item_id

                    )

                ELSE
                    NULL

            END AS item_name,

            i.quantity,

            i.updated_at

        FROM inventory_balances i

        INNER JOIN warehouses w

            ON w.id =
               i.warehouse_id

        WHERE 1 = 1

    `;

    const params = [];

    if (
        filters.warehouse_id
    ) {

        sql += `
            AND i.warehouse_id = ?
        `;

        params.push(
            Number(
                filters.warehouse_id
            )
        );

    }

    if (
        filters.item_type
    ) {

        sql += `
            AND i.item_type = ?
        `;

        params.push(
            String(
                filters.item_type
            )
        );

    }

    sql += `

        ORDER BY

            w.name,

            item_name

    `;

    const result =
        await env.DB
            .prepare(sql)
            .bind(...params)
            .all();

    return result.results;

}


// ============================================================
// INVENTORY BALANCE
// ============================================================

async function getInventoryBalance(
    env,
    warehouseId,
    itemType,
    itemId
) {

    const result =
        await env.DB
            .prepare(`

                SELECT

                    id,

                    quantity

                FROM inventory_balances

                WHERE

                    warehouse_id = ?

                    AND

                    item_type = ?

                    AND

                    item_id = ?

                LIMIT 1

            `)

            .bind(

                warehouseId,

                itemType,

                itemId

            )

            .first();

    return result
        ? Number(
            result.quantity
        )
        : 0;

}


// ============================================================
// INVENTORY UPDATE
// ============================================================

async function changeInventory(
    env,
    {
        warehouseId,
        itemType,
        itemId,
        delta,
        transactionType,
        userId,
        referenceType = null,
        referenceId = null,
        description = null
    }
) {

    warehouseId =
        positiveId(
            warehouseId,
            "انبار",
            "INV-001"
        );

    itemId =
        positiveId(
            itemId,
            "قلم انبار",
            "INV-002"
        );

    if (
        ![
            "part",
            "product"
        ].includes(
            itemType
        )
    ) {

        throw new AppError(

            "INV-003",

            "نوع قلم انبار معتبر نیست.",

            400

        );

    }

    delta =
        Number(delta);

    if (
        !Number.isFinite(delta) ||
        delta === 0
    ) {

        throw new AppError(

            "INV-004",

            "مقدار گردش موجودی معتبر نیست.",

            400

        );

    }

    const current =
        await getInventoryBalance(

            env,

            warehouseId,

            itemType,

            itemId

        );

    const next =
        current + delta;

    if (next < 0) {

        throw new AppError(

            "INV-005",

            "موجودی کافی نیست.",

            409,

            {

                current,

                requested:
                    Math.abs(delta),

                remaining:
                    current

            }

        );

    }

    const existing =
        await env.DB
            .prepare(`

                SELECT
                    id

                FROM inventory_balances

                WHERE

                    warehouse_id = ?

                    AND

                    item_type = ?

                    AND

                    item_id = ?

                LIMIT 1

            `)

            .bind(

                warehouseId,

                itemType,

                itemId

            )

            .first();

    if (existing) {

        await env.DB
            .prepare(`

                UPDATE inventory_balances

                SET

                    quantity = ?,

                    updated_at =
                        CURRENT_TIMESTAMP

                WHERE id = ?

            `)

            .bind(

                next,

                existing.id

            )

            .run();

    }

    else {

        await env.DB
            .prepare(`

                INSERT INTO inventory_balances
                (

                    warehouse_id,

                    item_type,

                    item_id,

                    quantity

                )

                VALUES (?, ?, ?, ?)

            `)

            .bind(

                warehouseId,

                itemType,

                itemId,

                next

            )

            .run();

    }

    await env.DB
        .prepare(`

            INSERT INTO inventory_transactions
            (

                transaction_type,

                warehouse_id,

                item_type,

                item_id,

                quantity,

                reference_type,

                reference_id,

                description,

                user_id

            )

            VALUES

            (?, ?, ?, ?, ?, ?, ?, ?, ?)

        `)

        .bind(

            transactionType,

            warehouseId,

            itemType,

            itemId,

            Math.abs(delta),

            referenceType,

            referenceId,

            description,

            userId

        )

        .run();

    return next;

}


// ============================================================
// PRODUCTION BOM CALCULATION
// ============================================================

async function calculateMaterialRequirement(
    env,
    bomId,
    productionQuantity
) {

    bomId =
        positiveId(
            bomId,
            "BOM",
            "BOM-010"
        );

    productionQuantity =
        positiveNumber(
            productionQuantity,
            "مقدار تولید",
            "PROD-010"
        );

    const details =
        await env.DB
            .prepare(`

                SELECT

                    d.id,

                    d.part_id,

                    p.code AS part_code,

                    p.name AS part_name,

                    d.consumption_factor,

                    d.scrap_percent,

                    u.name AS unit_name

                FROM bom_details d

                INNER JOIN parts p

                    ON p.id =
                       d.part_id

                INNER JOIN units u

                    ON u.id =
                       p.unit_id

                WHERE

                    d.bom_id = ?

                    AND

                    d.status = 'active'

                ORDER BY

                    d.id

            `)

            .bind(bomId)

            .all();

    if (
        !details.results.length
    ) {

        throw new AppError(

            "BOM-011",

            "برای این BOM هیچ ماده یا قطعه فعالی تعریف نشده است.",

            409

        );

    }

    return details.results.map(
        item => {

            const base =
                Number(
                    item.consumption_factor
                ) *
                productionQuantity;

            const scrap =
                Number(
                    item.scrap_percent || 0
                );

            const required =
                base *
                (
                    1 +
                    scrap / 100
                );

            return {

                part_id:
                    item.part_id,

                part_code:
                    item.part_code,

                part_name:
                    item.part_name,

                unit_name:
                    item.unit_name,

                consumption_factor:
                    Number(
                        item.consumption_factor
                    ),

                scrap_percent:
                    scrap,

                required_quantity:
                    required

            };

        }
    );

}

// ============================================================
// LOGIN
// ============================================================

async function login(
    request,
    env
) {

    const body =
        await readJson(
            request
        );

    const username =
        requiredText(
            body.username,
            "نام کاربری",
            "AUTH-010"
        );

    const password =
        String(
            body.password ?? ""
        );

    if (!password) {

        throw new AppError(

            "AUTH-011",

            "رمز عبور الزامی است.",

            400

        );

    }

    const passwordHash =
        await sha256(
            password
        );

    const user =
        await env.DB
            .prepare(`

                SELECT

                    id,

                    username,

                    full_name,

                    email,

                    role,

                    status

                FROM users

                WHERE

                    username = ?

                    AND

                    password_hash = ?

                    AND

                    status = 'active'

                LIMIT 1

            `)

            .bind(

                username,

                passwordHash

            )

            .first();

    if (!user) {

        throw new AppError(

            "AUTH-012",

            "نام کاربری یا رمز عبور صحیح نیست.",

            401

        );

    }

    const token =
        generateToken();

    const tokenHash =
        await sha256(
            token
        );

    await env.DB
        .prepare(`

            INSERT INTO user_sessions
            (

                user_id,

                token_hash,

                expires_at

            )

            VALUES

            (

                ?,

                ?,

                datetime(
                    'now',
                    '+${SESSION_HOURS} hours'
                )

            )

        `)

        .bind(

            user.id,

            tokenHash

        )

        .run();

    await writeAudit(

        env,

        user.id,

        "LOGIN",

        "users",

        user.id

    );

    return {

        token,

        user

    };

}
// ============================================================
// LOGOUT
// ============================================================

async function logout(
    request,
    env
) {

    const token =
        getBearerToken(
            request
        );

    if (token) {

        await env.DB
            .prepare(`

                DELETE FROM user_sessions

                WHERE

                    token_hash = ?

            `)

            .bind(
                await sha256(token)
            )

            .run();

    }

    return {

        message:
            "با موفقیت از سیستم خارج شدید."

    };

}


// ============================================================
// CREATE UNIT
// ============================================================

async function createUnit(
    request,
    env,
    user
) {

    const body =
        await readJson(
            request
        );

    const code =
        requiredText(
            body.code,
            "کد واحد",
            "UNIT-001"
        );

    const name =
        requiredText(
            body.name,
            "نام واحد",
            "UNIT-002"
        );

    try {

        const result =
            await env.DB
                .prepare(`

                    INSERT INTO units
                    (
                        code,
                        name,
                        status
                    )

                    VALUES
                    (
                        ?,
                        ?,
                        'active'
                    )

                `)

                .bind(
                    code,
                    name
                )

                .run();

        await writeAudit(

            env,

            user.id,

            "CREATE",

            "units",

            result.meta.last_row_id,

            body

        );

        return {

            id:
                result.meta.last_row_id,

            message:
                "واحد با موفقیت ثبت شد."

        };

    }

    catch (error) {

        throw databaseError(

            error,

            "UNIT-003",

            "ثبت واحد انجام نشد."

        );

    }

}


// ============================================================
// CREATE PRODUCT
// ============================================================

async function createProduct(
    request,
    env,
    user
) {

    const body =
        await readJson(
            request
        );

    const code =
        requiredText(
            body.code,
            "کد محصول",
            "PRODUCT-001"
        );

    const name =
        requiredText(
            body.name,
            "نام محصول",
            "PRODUCT-002"
        );

    const unitId =
        positiveId(
            body.unit_id,
            "واحد محصول",
            "PRODUCT-003"
        );

    const unit =
        await env.DB
            .prepare(`

                SELECT id

                FROM units

                WHERE

                    id = ?

                    AND

                    status = 'active'

                LIMIT 1

            `)

            .bind(unitId)

            .first();

    if (!unit) {

        throw new AppError(

            "PRODUCT-004",

            "واحد انتخاب‌شده وجود ندارد.",

            404

        );

    }

    try {

        const result =
            await env.DB
                .prepare(`

                    INSERT INTO products
                    (

                        code,

                        name,

                        unit_id,

                        status,

                        created_by

                    )

                    VALUES

                    (

                        ?,

                        ?,

                        ?,

                        'active',

                        ?

                    )

                `)

                .bind(

                    code,

                    name,

                    unitId,

                    user.id

                )

                .run();

        await writeAudit(

            env,

            user.id,

            "CREATE",

            "products",

            result.meta.last_row_id,

            body

        );

        return {

            id:
                result.meta.last_row_id,

            message:
                "محصول با موفقیت ثبت شد."

        };

    }

    catch (error) {

        throw databaseError(

            error,

            "PRODUCT-005",

            "ثبت محصول انجام نشد."

        );

    }

}


// ============================================================
// CREATE PART
// ============================================================

async function createPart(
    request,
    env,
    user
) {

    const body =
        await readJson(
            request
        );

    const code =
        requiredText(
            body.code,
            "کد قطعه",
            "PART-001"
        );

    const name =
        requiredText(
            body.name,
            "شرح قطعه",
            "PART-002"
        );

    const unitId =
        positiveId(
            body.unit_id,
            "واحد قطعه",
            "PART-003"
        );

    const barcode =
        body.barcode
            ? String(
                body.barcode
            ).trim()
            : null;

    const minStock =
        nonNegativeNumber(
            body.min_stock ?? 0,
            "حداقل موجودی",
            "PART-004"
        );

    const reorderPoint =
        nonNegativeNumber(
            body.reorder_point ?? 0,
            "نقطه سفارش",
            "PART-005"
        );

    const unit =
        await env.DB
            .prepare(`

                SELECT id

                FROM units

                WHERE

                    id = ?

                    AND

                    status = 'active'

                LIMIT 1

            `)

            .bind(unitId)

            .first();

    if (!unit) {

        throw new AppError(

            "PART-006",

            "واحد انتخاب‌شده وجود ندارد.",

            404

        );

    }

    try {

        const result =
            await env.DB
                .prepare(`

                    INSERT INTO parts
                    (

                        code,

                        name,

                        unit_id,

                        barcode,

                        min_stock,

                        reorder_point,

                        status,

                        created_by

                    )

                    VALUES

                    (

                        ?,

                        ?,

                        ?,

                        ?,

                        ?,

                        ?,

                        'active',

                        ?

                    )

                `)

                .bind(

                    code,

                    name,

                    unitId,

                    barcode || null,

                    minStock,

                    reorderPoint,

                    user.id

                )

                .run();

        await writeAudit(

            env,

            user.id,

            "CREATE",

            "parts",

            result.meta.last_row_id,

            body

        );

        return {

            id:
                result.meta.last_row_id,

            message:
                "قطعه با موفقیت ثبت شد."

        };

    }

    catch (error) {

        throw databaseError(

            error,

            "PART-007",

            "ثبت قطعه انجام نشد."

        );

    }

}


// ============================================================
// CREATE BOM
// ============================================================

async function createBom(
    request,
    env,
    user
) {

    const body =
        await readJson(
            request
        );

    const code =
        requiredText(
            body.code,
            "کد BOM",
            "BOM-020"
        );

    const productId =
        positiveId(
            body.product_id,
            "محصول",
            "BOM-021"
        );

    const version =
        Number(
            body.version ?? 1
        );

    if (
        !Number.isInteger(
            version
        ) ||
        version <= 0
    ) {

        throw new AppError(

            "BOM-022",

            "نسخه BOM معتبر نیست.",

            400

        );

    }

    const effectiveFrom =
        body.effective_from
            ? validatePersianDate(
                body.effective_from,
                "تاریخ شروع BOM",
                "BOM-023"
            )
            : null;

    const effectiveTo =
        body.effective_to
            ? validatePersianDate(
                body.effective_to,
                "تاریخ پایان BOM",
                "BOM-024"
            )
            : null;

    const product =
        await env.DB
            .prepare(`

                SELECT id

                FROM products

                WHERE

                    id = ?

                    AND

                    status = 'active'

                LIMIT 1

            `)

            .bind(productId)

            .first();

    if (!product) {

        throw new AppError(

            "BOM-025",

            "محصول انتخاب‌شده وجود ندارد.",

            404

        );

    }

    try {

        const result =
            await env.DB
                .prepare(`

                    INSERT INTO bom_headers
                    (

                        code,

                        product_id,

                        version,

                        effective_from,

                        effective_to,

                        status,

                        created_by

                    )

                    VALUES

                    (

                        ?,

                        ?,

                        ?,

                        ?,

                        ?,

                        'active',

                        ?

                    )

                `)

                .bind(

                    code,

                    productId,

                    version,

                    effectiveFrom,

                    effectiveTo,

                    user.id

                )

                .run();

        await writeAudit(

            env,

            user.id,

            "CREATE",

            "bom_headers",

            result.meta.last_row_id,

            body

        );

        return {

            id:
                result.meta.last_row_id,

            message:
                "BOM با موفقیت ایجاد شد."

        };

    }

    catch (error) {

        throw databaseError(

            error,

            "BOM-026",

            "ایجاد BOM انجام نشد."

        );

    }

}


// ============================================================
// ADD BOM DETAIL
// ============================================================

async function addBomDetail(
    request,
    env,
    user
) {

    const body =
        await readJson(
            request
        );

    const bomId =
        positiveId(
            body.bom_id,
            "BOM",
            "BOMDETAIL-001"
        );

    const partId =
        positiveId(
            body.part_id,
            "قطعه",
            "BOMDETAIL-002"
        );

    const consumptionFactor =
        positiveNumber(
            body.consumption_factor,
            "ضریب مصرف",
            "BOMDETAIL-003"
        );

    const scrapPercent =
        nonNegativeNumber(
            body.scrap_percent ?? 0,
            "درصد ضایعات",
            "BOMDETAIL-004"
        );

    if (
        scrapPercent > 100
    ) {

        throw new AppError(

            "BOMDETAIL-005",

            "درصد ضایعات نمی‌تواند بیشتر از 100 باشد.",

            400

        );

    }

    const bom =
        await env.DB
            .prepare(`

                SELECT id

                FROM bom_headers

                WHERE

                    id = ?

                    AND

                    status = 'active'

                LIMIT 1

            `)

            .bind(bomId)

            .first();

    if (!bom) {

        throw new AppError(

            "BOMDETAIL-006",

            "BOM انتخاب‌شده وجود ندارد یا فعال نیست.",

            404

        );

    }

    const part =
        await env.DB
            .prepare(`

                SELECT id

                FROM parts

                WHERE

                    id = ?

                    AND

                    status = 'active'

                LIMIT 1

            `)

            .bind(partId)

            .first();

    if (!part) {

        throw new AppError(

            "BOMDETAIL-007",

            "قطعه انتخاب‌شده وجود ندارد یا فعال نیست.",

            404

        );

    }

    try {

        const result =
            await env.DB
                .prepare(`

                    INSERT INTO bom_details
                    (

                        bom_id,

                        part_id,

                        consumption_factor,

                        scrap_percent,

                        status,

                        created_by

                    )

                    VALUES

                    (

                        ?,

                        ?,

                        ?,

                        ?,

                        'active',

                        ?

                    )

                `)

                .bind(

                    bomId,

                    partId,

                    consumptionFactor,

                    scrapPercent,

                    user.id

                )

                .run();

        await writeAudit(

            env,

            user.id,

            "CREATE",

            "bom_details",

            result.meta.last_row_id,

            body

        );

        return {

            id:
                result.meta.last_row_id,

            message:
                "جزء BOM با موفقیت اضافه شد."

        };

    }

    catch (error) {

        throw databaseError(

            error,

            "BOMDETAIL-008",

            "این قطعه احتمالاً قبلاً در BOM ثبت شده است."

        );

    }

}



// ============================================================
// UPDATE BOM DETAIL
// ============================================================

async function updateBomDetail(
    request,
    env,
    user
) {

    const body =
        await readJson(
            request
        );

    const detailId =
        positiveId(
            body.id,
            "جزء BOM",
            "BOMDETAIL-009"
        );

    const partId =
        positiveId(
            body.part_id,
            "قطعه",
            "BOMDETAIL-010"
        );

    const consumptionFactor =
        positiveNumber(
            body.consumption_factor,
            "ضریب مصرف",
            "BOMDETAIL-011"
        );

    const scrapPercent =
        nonNegativeNumber(
            body.scrap_percent ?? 0,
            "درصد ضایعات",
            "BOMDETAIL-012"
        );

    if (
        scrapPercent > 100
    ) {

        throw new AppError(

            "BOMDETAIL-013",

            "درصد ضایعات نمی‌تواند بیشتر از 100 باشد.",

            400

        );

    }


    // ========================================================
    // FIND EXISTING DETAIL
    // ========================================================

    const existing =
        await env.DB
            .prepare(`

                                                                                                                                                                                                                                                                                                                                                                                                        SELECT

                                                                                                                                                                                                                                                                                                                                                                                                                            id,

                                                                                                                                                                                                                                                                                                                                                                                                                                                bom_id,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                    part_id,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        consumption_factor,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            scrap_percent,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                status

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                FROM bom_details

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                WHERE

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    id = ?

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    LIMIT 1

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                `)

            .bind(
                detailId
            )

            .first();


    if (!existing) {

        throw new AppError(

            "BOMDETAIL-014",

            "جزء BOM موردنظر پیدا نشد.",

            404

        );

    }


    // ========================================================
    // CHECK BOM
    // ========================================================

    const bom =
        await env.DB
            .prepare(`

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    SELECT

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        id

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        FROM bom_headers

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        WHERE

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            id = ?

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                AND

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    status = 'active'

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    LIMIT 1

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                `)

            .bind(
                existing.bom_id
            )

            .first();


    if (!bom) {

        throw new AppError(

            "BOMDETAIL-015",

            "BOM مربوط به این جزء وجود ندارد یا فعال نیست.",

            404

        );

    }


    // ========================================================
    // CHECK PART
    // ========================================================

    const part =
        await env.DB
            .prepare(`

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    SELECT

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        id

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        FROM parts

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        WHERE

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            id = ?

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                AND

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    status = 'active'

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    LIMIT 1

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                `)

            .bind(
                partId
            )

            .first();


    if (!part) {

        throw new AppError(

            "BOMDETAIL-016",

            "قطعه انتخاب‌شده وجود ندارد یا فعال نیست.",

            404

        );

    }


    // ========================================================
    // UPDATE
    // ========================================================

    try {

        await env.DB
            .prepare(`

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    UPDATE bom_details

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    SET

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        part_id = ?,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            consumption_factor = ?,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                scrap_percent = ?

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                WHERE

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    id = ?

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                `)

            .bind(

                partId,

                consumptionFactor,

                scrapPercent,

                detailId

            )

            .run();


        // ====================================================
        // AUDIT
        // ====================================================

        await writeAudit(

            env,

            user.id,

            "UPDATE",

            "bom_details",

            detailId,

            body

        );


    }

    catch (error) {

        throw databaseError(

            error,

            "BOMDETAIL-017",

            "ویرایش جزء BOM انجام نشد. ممکن است این قطعه قبلاً در همین BOM ثبت شده باشد."

        );

    }


    // ========================================================
    // RETURN UPDATED RECORD
    // ========================================================

    const updated =
        await env.DB
            .prepare(`

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        SELECT

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            d.id,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                d.bom_id,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    d.part_id,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        p.code AS part_code,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            p.name AS part_name,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                p.barcode,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    u.name AS unit_name,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        d.consumption_factor,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            d.scrap_percent,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                d.status

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                FROM bom_details d

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                INNER JOIN parts p

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    ON p.id = d.part_id

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    INNER JOIN units u

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        ON u.id = p.unit_id

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        WHERE

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            d.id = ?

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            LIMIT 1

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        `)

            .bind(
                detailId
            )

            .first();


    return {

        item:
            updated,

        message:
            "جزء BOM با موفقیت ویرایش شد."

    };

}





// ============================================================
// DELETE BOM DETAIL
// ============================================================

async function deleteBomDetail(
    request,
    env,
    user
) {

    const body =
        await readJson(
            request
        );

    const detailId =
        positiveId(
            body.id,
            "جزء BOM",
            "BOMDETAIL-018"
        );


    // ========================================================
    // FIND EXISTING DETAIL
    // ========================================================

    const existing =
        await env.DB
            .prepare(`

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    SELECT

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        id,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            bom_id,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                part_id,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    consumption_factor,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        scrap_percent,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            status

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            FROM bom_details

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            WHERE

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                id = ?

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                LIMIT 1

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            `)

            .bind(
                detailId
            )

            .first();


    if (!existing) {

        throw new AppError(

            "BOMDETAIL-019",

            "جزء BOM موردنظر پیدا نشد.",

            404

        );

    }


    // ========================================================
    // CHECK BOM
    // ========================================================

    const bom =
        await env.DB
            .prepare(`

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                SELECT

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    id

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    FROM bom_headers

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    WHERE

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        id = ?

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            AND

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                status = 'active'

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                LIMIT 1

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            `)

            .bind(
                existing.bom_id
            )

            .first();


    if (!bom) {

        throw new AppError(

            "BOMDETAIL-020",

            "BOM مربوط به این جزء وجود ندارد یا فعال نیست.",

            404

        );

    }


    // ========================================================
    // DELETE
    // ========================================================

    try {

        await env.DB
            .prepare(`

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                DELETE FROM bom_details

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                WHERE

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    id = ?

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                `)

            .bind(
                detailId
            )

            .run();


        // ====================================================
        // AUDIT
        // ====================================================

        await writeAudit(

            env,

            user.id,

            "DELETE",

            "bom_details",

            detailId,

            existing

        );


    }

    catch (error) {

        throw databaseError(

            error,

            "BOMDETAIL-021",

            "حذف جزء BOM انجام نشد."

        );

    }


    return {

        id:
            detailId,

        bom_id:
            existing.bom_id,

        deleted:
            true,

        message:
            "جزء BOM با موفقیت حذف شد."

    };

}

// ============================================================
// CREATE PRODUCTION PLAN
// ============================================================

async function createProductionPlan(
    request,
    env,
    user
) {

    const body =
        await readJson(
            request
        );


    // --------------------------------------------------------
    // VALIDATE INPUT
    // --------------------------------------------------------

    const planDate =
        validatePersianDate(
            body.plan_date,
            "تاریخ برنامه تولید",
            "PLAN-001"
        );


    const bomId =
        positiveId(
            body.bom_id,
            "BOM",
            "PLAN-002"
        );


    const plannedQuantity =
        positiveNumber(
            body.planned_quantity,
            "مقدار برنامه تولید",
            "PLAN-003"
        );


    // --------------------------------------------------------
    // LOAD ACTIVE BOM
    // --------------------------------------------------------

    const bom =
        await env.DB
            .prepare(`

                SELECT

                    id,

                    product_id

                FROM bom_headers

                WHERE

                    id = ?

                    AND

                    status = 'active'

                LIMIT 1

            `)
            .bind(
                bomId
            )
            .first();


    if (!bom) {

        throw new AppError(

            "PLAN-004",

            "BOM انتخاب‌شده معتبر نیست.",

            404

        );

    }

    // --------------------------------------------------------
    // CHECK DUPLICATE PRODUCTION PLAN
    //
    // یک BOM مشخص نباید در یک تاریخ مشخص
    // بیش از یک بار برنامه‌ریزی شود.
    // --------------------------------------------------------

    const existingPlan =
        await env.DB
            .prepare(`

                SELECT

                    id,

                    plan_date,

                    bom_id,

                    planned_quantity,

                    status

                FROM planning_daily

                WHERE

                    plan_date = ?

                    AND

                    bom_id = ?

                LIMIT 1

            `)
            .bind(

                planDate,

                bomId

            )
            .first();


    if (existingPlan) {

        throw new AppError(

            "PLAN-008",

            "برای این تاریخ، این BOM قبلاً در برنامه تولید ثبت شده است.",

            409,

            {

                existing_plan_id:
                    existingPlan.id,

                plan_date:
                    existingPlan.plan_date,

                bom_id:
                    existingPlan.bom_id,

                planned_quantity:
                    Number(
                        existingPlan.planned_quantity
                    ),

                status:
                    existingPlan.status

            }

        );

    }
    // --------------------------------------------------------
    // FIND RAW MATERIAL WAREHOUSE
    // --------------------------------------------------------

    const warehouse =
        await env.DB
            .prepare(`

                SELECT

                    id

                FROM warehouses

                WHERE

                    warehouse_type =
                    'material'

                    AND

                    status =
                    'active'

                ORDER BY

                    id

                LIMIT 1

            `)
            .first();


    if (!warehouse) {

        throw new AppError(

            "PLAN-005",

            "انبار مواد اولیه فعال پیدا نشد.",

            404

        );

    }


    const rawWarehouseId =
        warehouse.id;


    // --------------------------------------------------------
    // LOAD BOM MATERIALS
    // --------------------------------------------------------

    const materialsResult =
        await env.DB
            .prepare(`

                SELECT

                    bd.part_id,

                    bd.consumption_factor,

                    bd.scrap_percent,

                    p.code AS part_code,

                    p.name AS part_name

                FROM bom_details bd

                INNER JOIN parts p

                    ON p.id =
                       bd.part_id

                WHERE

                    bd.bom_id = ?

                    AND

                    bd.status = 'active'

                    AND

                    p.status = 'active'

                ORDER BY

                    bd.id

            `)
            .bind(
                bomId
            )
            .all();


    const materials =
        materialsResult.results || [];


    if (
        materials.length === 0
    ) {

        throw new AppError(

            "PLAN-006",

            "برای BOM انتخاب‌شده هیچ قطعه فعالی تعریف نشده است.",

            409

        );

    }


    // --------------------------------------------------------
    // CHECK MATERIAL AVAILABILITY
    //
    // Required quantity:
    //
    // consumption_factor
    // ×
    // planned_quantity
    //
    // + scrap
    //
    // Inventory is NOT changed here.
    // --------------------------------------------------------

    const stockCheck = [];

    const shortages = [];


    for (
        const material
        of materials
    ) {

        const consumptionFactor =
            Number(
                material.consumption_factor
            );


        const scrapPercent =
            Number(
                material.scrap_percent || 0
            );


        const baseRequired =
            consumptionFactor *
            Number(
                plannedQuantity
            );


        const requiredQuantity =
            baseRequired *
            (
                1 +
                (
                    scrapPercent /
                    100
                )
            );


        const availableQuantity =
            Number(
                await getInventoryBalance(

                    env,

                    rawWarehouseId,

                    "part",

                    material.part_id

                ) || 0
            );


        const sufficient =
            availableQuantity >=
            requiredQuantity;


        const check = {

            part_id:
                material.part_id,

            part_code:
                material.part_code,

            part_name:
                material.part_name,

            consumption_factor:
                consumptionFactor,

            scrap_percent:
                scrapPercent,

            planned_quantity:
                Number(
                    plannedQuantity
                ),

            required_quantity:
                requiredQuantity,

            available_quantity:
                availableQuantity,

            sufficient

        };


        stockCheck.push(
            check
        );


        if (!sufficient) {

            shortages.push(
                check
            );

        }

    }


    // --------------------------------------------------------
    // FAIL IF ANY MATERIAL IS SHORT
    //
    // Logical AND:
    //
    // part 1 sufficient
    // AND
    // part 2 sufficient
    // AND
    // part 3 sufficient
    // ...
    //
    // --------------------------------------------------------

    if (
        shortages.length > 0
    ) {

        const shortageText =
            shortages
                .map(
                    item => {

                        const shortage =
                            item.required_quantity -
                            item.available_quantity;

                        return (

                            `«${item.part_name}» ` +
                            `موجودی: ${item.available_quantity} ` +
                            `موردنیاز: ${item.required_quantity} ` +
                            `کسری: ${shortage}`

                        );

                    }
                )
                .join(" | ");


        throw new AppError(

            "PLAN-007",

            `امکان ثبت برنامه تولید وجود ندارد. موجودی مواد اولیه کافی نیست: ${shortageText}`,

            409,

            {

                bom_id:
                    bomId,

                planned_quantity:
                    Number(
                        plannedQuantity
                    ),

                warehouse_id:
                    rawWarehouseId,

                materials:
                    stockCheck,

                shortages

            }

        );

    }


    // --------------------------------------------------------
    // INSERT PRODUCTION PLAN
    //
    // IMPORTANT:
    // No inventory is changed here.
    // Inventory will be consumed only when
    // registerProduction() is executed.
    // --------------------------------------------------------

    const result =
        await env.DB
            .prepare(`

                INSERT INTO planning_daily
                (

                    plan_date,

                    bom_id,

                    planned_quantity,

                    status,

                    created_by

                )

                VALUES

                (

                    ?,

                    ?,

                    ?,

                    'planned',

                    ?

                )

            `)
            .bind(

                planDate,

                bomId,

                plannedQuantity,

                user.id

            )
            .run();


    const planningId =
        result.meta.last_row_id;


    // --------------------------------------------------------
    // AUDIT
    // --------------------------------------------------------

    await writeAudit(

        env,

        user.id,

        "CREATE",

        "planning_daily",

        planningId,

        {

            ...body,

            material_check:
                stockCheck

        }

    );


    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    return {

        id:
            planningId,

        message:
            "برنامه تولید با موفقیت ثبت شد. موجودی مواد اولیه بررسی شد و هیچ موجودی در این مرحله کسر نشد.",

        planning: {

            plan_date:
                planDate,

            bom_id:
                bomId,

            planned_quantity:
                Number(
                    plannedQuantity
                ),

            status:
                "planned"

        },

        material_check:
            stockCheck

    };

}

// ============================================================
// GET PRODUCTION PLANS
// ============================================================

async function getProductionPlans(
    env
) {

    const result =
        await env.DB
            .prepare(`

                SELECT

                    x.id,

                    x.plan_date,

                    x.bom_id,

                    b.code AS bom_code,

                    b.product_id,

                    p.code AS product_code,

                    p.name AS product_name,

                    x.planned_quantity,

                    COALESCE(

                        (

                            SELECT
                                SUM(
                                    produced_quantity
                                )

                            FROM production pr

                            WHERE

                                pr.planning_daily_id =
                                x.id

                                AND

                                pr.status =
                                'completed'

                        ),

                        0

                    ) AS produced_quantity,

                    x.status

                FROM planning_daily x

                INNER JOIN bom_headers b

                    ON b.id =
                       x.bom_id

                INNER JOIN products p

                    ON p.id =
                       b.product_id

                ORDER BY

                    x.plan_date DESC,

                    x.id DESC

            `)
            .all();

    return result.results;

}
// ============================================================
// UPDATE PRODUCTION PLAN
// ============================================================

async function updateProductionPlan(
    request,
    env,
    user
) {

    const body =
        await readJson(
            request
        );


    // --------------------------------------------------------
    // VALIDATE INPUT
    // --------------------------------------------------------

    const planningId =
        positiveId(
            body.id ||
            body.planning_daily_id,
            "برنامه تولید",
            "PLAN-101"
        );


    const planDate =
        validatePersianDate(
            body.plan_date,
            "تاریخ برنامه تولید",
            "PLAN-102"
        );


    const bomId =
        positiveId(
            body.bom_id,
            "BOM",
            "PLAN-103"
        );


    const plannedQuantity =
        positiveNumber(
            body.planned_quantity,
            "مقدار برنامه تولید",
            "PLAN-104"
        );


    // --------------------------------------------------------
    // LOAD EXISTING PLAN
    // --------------------------------------------------------

    const existingPlan =
        await env.DB
            .prepare(`

                SELECT

                    id,

                    plan_date,

                    bom_id,

                    planned_quantity,

                    status

                FROM planning_daily

                WHERE

                    id = ?

                LIMIT 1

            `)
            .bind(
                planningId
            )
            .first();


    if (!existingPlan) {

        throw new AppError(

            "PLAN-105",

            "برنامه تولید پیدا نشد.",

            404

        );

    }


    // --------------------------------------------------------
    // CHECK PLAN STATUS
    // --------------------------------------------------------

    if (
        ![
            "planned",
            "in_progress"
        ].includes(
            existingPlan.status
        )
    ) {

        throw new AppError(

            "PLAN-106",

            "این برنامه تولید در وضعیت قابل ویرایش نیست.",

            409

        );

    }


    // --------------------------------------------------------
    // LOAD ACTIVE BOM
    // --------------------------------------------------------

    const bom =
        await env.DB
            .prepare(`

                SELECT

                    id,

                    product_id

                FROM bom_headers

                WHERE

                    id = ?

                    AND

                    status = 'active'

                LIMIT 1

            `)
            .bind(
                bomId
            )
            .first();


    if (!bom) {

        throw new AppError(

            "PLAN-107",

            "BOM انتخاب‌شده معتبر نیست.",

            404

        );

    }


    // --------------------------------------------------------
    // CHECK DUPLICATE DATE + BOM
    //
    // خود برنامه فعلی باید از این بررسی مستثنی باشد.
    // --------------------------------------------------------

    const duplicatePlan =
        await env.DB
            .prepare(`

                SELECT

                    id

                FROM planning_daily

                WHERE

                    plan_date = ?

                    AND

                    bom_id = ?

                    AND

                    id != ?

                LIMIT 1

            `)
            .bind(

                planDate,

                bomId,

                planningId

            )
            .first();


    if (duplicatePlan) {

        throw new AppError(

            "PLAN-108",

            "برای این تاریخ، این BOM قبلاً در برنامه تولید ثبت شده است.",

            409,

            {

                existing_plan_id:
                    duplicatePlan.id

            }

        );

    }


    // --------------------------------------------------------
    // CHECK ALREADY PRODUCED
    // --------------------------------------------------------

    const produced =
        await env.DB
            .prepare(`

                SELECT

                    COALESCE(

                        SUM(
                            produced_quantity
                        ),

                        0

                    ) AS total

                FROM production

                WHERE

                    planning_daily_id = ?

                    AND

                    status = 'completed'

            `)
            .bind(
                planningId
            )
            .first();


    const alreadyProduced =
        Number(
            produced?.total || 0
        );


    // --------------------------------------------------------
    // NEW PLAN CANNOT BE LESS THAN ALREADY PRODUCED
    // --------------------------------------------------------

    if (
        plannedQuantity <
        alreadyProduced
    ) {

        throw new AppError(

            "PLAN-109",

            `مقدار برنامه تولید نمی‌تواند کمتر از مقدار تولیدشده باشد. تولیدشده تاکنون: ${alreadyProduced}`,

            409,

            {

                already_produced:
                    alreadyProduced,

                requested_plan_quantity:
                    plannedQuantity

            }

        );

    }


    // --------------------------------------------------------
    // DETERMINE QUANTITY CHANGE
    // --------------------------------------------------------

    const oldPlannedQuantity =
        Number(
            existingPlan.planned_quantity
        );


    const quantityIncrease =
        Math.max(

            0,

            plannedQuantity -
            oldPlannedQuantity

        );


    // --------------------------------------------------------
    // NO INCREASE
    //
    // اگر مقدار افزایش نداشته باشد،
    // بررسی موجودی اضافه لازم نیست.
    // --------------------------------------------------------

    let stockCheck = [];


    // --------------------------------------------------------
    // CHECK ADDITIONAL MATERIAL STOCK
    //
    // فقط مقدار اضافه‌شده بررسی می‌شود.
    // --------------------------------------------------------

    if (
        quantityIncrease > 0
    ) {

        // ----------------------------------------------------
        // FIND RAW MATERIAL WAREHOUSE
        // ----------------------------------------------------

        const warehouse =
            await env.DB
                .prepare(`

                    SELECT

                        id

                    FROM warehouses

                    WHERE

                        warehouse_type =
                        'material'

                        AND

                        status =
                        'active'

                    ORDER BY

                        id

                    LIMIT 1

                `)
                .first();


        if (!warehouse) {

            throw new AppError(

                "PLAN-110",

                "انبار مواد اولیه فعال پیدا نشد.",

                404

            );

        }


        const rawWarehouseId =
            warehouse.id;


        // ----------------------------------------------------
        // LOAD BOM MATERIALS
        // ----------------------------------------------------

        const materialsResult =
            await env.DB
                .prepare(`

                    SELECT

                        bd.part_id,

                        bd.consumption_factor,

                        bd.scrap_percent,

                        p.code AS part_code,

                        p.name AS part_name

                    FROM bom_details bd

                    INNER JOIN parts p

                        ON p.id =
                           bd.part_id

                    WHERE

                        bd.bom_id = ?

                        AND

                        bd.status = 'active'

                        AND

                        p.status = 'active'

                    ORDER BY

                        bd.id

                `)
                .bind(
                    bomId
                )
                .all();


        const materials =
            materialsResult.results || [];


        if (
            materials.length === 0
        ) {

            throw new AppError(

                "PLAN-111",

                "برای BOM انتخاب‌شده هیچ قطعه فعالی تعریف نشده است.",

                409

            );

        }


        // ----------------------------------------------------
        // CHECK ADDITIONAL MATERIAL REQUIREMENT
        // ----------------------------------------------------

        const shortages = [];


        for (
            const material
            of materials
        ) {

            const consumptionFactor =
                Number(
                    material.consumption_factor
                );


            const scrapPercent =
                Number(
                    material.scrap_percent || 0
                );


            const baseRequired =
                consumptionFactor *
                quantityIncrease;


            const requiredQuantity =
                baseRequired *
                (
                    1 +
                    (
                        scrapPercent /
                        100
                    )
                );


            const availableQuantity =
                Number(

                    await getInventoryBalance(

                        env,

                        rawWarehouseId,

                        "part",

                        material.part_id

                    ) || 0

                );


            const sufficient =
                availableQuantity >=
                requiredQuantity;


            const check = {

                part_id:
                    material.part_id,

                part_code:
                    material.part_code,

                part_name:
                    material.part_name,

                consumption_factor:
                    consumptionFactor,

                scrap_percent:
                    scrapPercent,

                additional_planned_quantity:
                    quantityIncrease,

                required_quantity:
                    requiredQuantity,

                available_quantity:
                    availableQuantity,

                sufficient

            };


            stockCheck.push(
                check
            );


            if (!sufficient) {

                shortages.push(
                    check
                );

            }

        }


        // ----------------------------------------------------
        // FAIL IF ADDITIONAL MATERIAL IS SHORT
        // ----------------------------------------------------

        if (
            shortages.length > 0
        ) {

            const shortageText =
                shortages
                    .map(
                        item => {

                            const shortage =
                                item.required_quantity -
                                item.available_quantity;


                            return (

                                `«${item.part_name}» ` +
                                `موجودی: ${item.available_quantity} ` +
                                `موردنیاز اضافه: ${item.required_quantity} ` +
                                `کسری: ${shortage}`

                            );

                        }
                    )
                    .join(" | ");


            throw new AppError(

                "PLAN-112",

                `امکان افزایش برنامه تولید وجود ندارد. موجودی مواد اولیه برای مقدار اضافه کافی نیست: ${shortageText}`,

                409,

                {

                    planning_id:
                        planningId,

                    bom_id:
                        bomId,

                    old_planned_quantity:
                        oldPlannedQuantity,

                    new_planned_quantity:
                        plannedQuantity,

                    quantity_increase:
                        quantityIncrease,

                    warehouse_id:
                        rawWarehouseId,

                    materials:
                        stockCheck,

                    shortages

                }

            );

        }

    }


    // --------------------------------------------------------
    // UPDATE PLAN
    //
    // هیچ موجودی در این مرحله تغییر نمی‌کند.
    // --------------------------------------------------------

    await env.DB
        .prepare(`

            UPDATE planning_daily

            SET

                plan_date = ?,

                bom_id = ?,

                planned_quantity = ?

            WHERE

                id = ?

        `)
        .bind(

            planDate,

            bomId,

            plannedQuantity,

            planningId

        )
        .run();


    // --------------------------------------------------------
    // AUDIT
    // --------------------------------------------------------

    await writeAudit(

        env,

        user.id,

        "UPDATE",

        "planning_daily",

        planningId,

        {

            before: {

                plan_date:
                    existingPlan.plan_date,

                bom_id:
                    existingPlan.bom_id,

                planned_quantity:
                    oldPlannedQuantity

            },

            after: {

                plan_date:
                    planDate,

                bom_id:
                    bomId,

                planned_quantity:
                    plannedQuantity

            },

            already_produced:
                alreadyProduced,

            quantity_increase:
                quantityIncrease,

            material_check:
                stockCheck

        }

    );


    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    return {

        id:
            planningId,

        message:
            "برنامه تولید با موفقیت بروزرسانی شد. موجودی مواد اولیه در صورت افزایش مقدار برنامه بررسی شد و هیچ موجودی در این مرحله کسر نشد.",

        planning: {

            id:
                planningId,

            plan_date:
                planDate,

            bom_id:
                bomId,

            planned_quantity:
                plannedQuantity,

            already_produced:
                alreadyProduced,

            quantity_increase:
                quantityIncrease,

            status:
                existingPlan.status

        },

        material_check:
            stockCheck

    };

}
// ============================================================
// REGISTER PRODUCTION
// ============================================================

async function registerProduction(
    request,
    env,
    user
) {

    const body =
        await readJson(
            request
        );


    // --------------------------------------------------------
    // VALIDATE INPUT
    // --------------------------------------------------------

    const planningId =
        positiveId(
            body.planning_daily_id,
            "برنامه تولید",
            "PROD-001"
        );

    const producedQuantity =
        positiveNumber(
            body.produced_quantity,
            "مقدار تولید",
            "PROD-002"
        );

    const productionDate =
        validatePersianDate(
            body.production_date,
            "تاریخ تولید",
            "PROD-003"
        );


    // --------------------------------------------------------
    // DESTINATION WAREHOUSE
    // --------------------------------------------------------
    //
    // این انبار از فرم ثبت تولید می‌آید.
    //
    // فقط باید از نوع:
    // finished
    // یا
    // general
    //
    // باشد.
    //
    // --------------------------------------------------------

    const destinationWarehouseId =
        body.warehouse_id
            ? positiveId(
                body.warehouse_id,
                "انبار محصول",
                "PROD-004"
            )
            : null;


    if (!destinationWarehouseId) {

        throw new AppError(

            "PROD-004",

            "انبار محصول را انتخاب کنید.",

            400

        );

    }


    // --------------------------------------------------------
    // VALIDATE DESTINATION WAREHOUSE
    // --------------------------------------------------------

    const destinationWarehouse =
        await env.DB
            .prepare(`

                SELECT

                    id,

                    code,

                    name,

                    warehouse_type,

                    status

                FROM warehouses

                WHERE

                    id = ?

                LIMIT 1

            `)

            .bind(
                destinationWarehouseId
            )

            .first();


    if (!destinationWarehouse) {

        throw new AppError(

            "PROD-005",

            "انبار انتخاب‌شده پیدا نشد.",

            404

        );

    }


    if (
        destinationWarehouse.status !==
        "active"
    ) {

        throw new AppError(

            "PROD-006",

            "انبار انتخاب‌شده فعال نیست.",

            409

        );

    }


    if (
        ![
            "finished",
            "general"
        ].includes(
            destinationWarehouse.warehouse_type
        )
    ) {

        throw new AppError(

            "PROD-007",

            "برای ثبت تولید فقط انبار محصول یا انبار عمومی قابل انتخاب است.",

            409

        );

    }


    // --------------------------------------------------------
    // LOAD PRODUCTION PLAN
    // --------------------------------------------------------

    const plan =
        await env.DB
            .prepare(`

                SELECT

                    pl.id,

                    pl.plan_date,

                    pl.planned_quantity,

                    pl.status,

                    b.id AS bom_id,

                    b.product_id,

                    b.code AS bom_code

                FROM planning_daily pl

                INNER JOIN bom_headers b

                    ON b.id =
                       pl.bom_id

                WHERE

                    pl.id = ?

                LIMIT 1

            `)

            .bind(
                planningId
            )

            .first();


    if (!plan) {

        throw new AppError(

            "PROD-008",

            "برنامه تولید پیدا نشد.",

            404

        );

    }


    // --------------------------------------------------------
    // CHECK PLAN STATUS
    // --------------------------------------------------------

    if (
        ![
            "planned",
            "in_progress"
        ].includes(
            plan.status
        )
    ) {

        throw new AppError(

            "PROD-009",

            "این برنامه تولید در وضعیت قابل ثبت تولید نیست.",

            409

        );

    }


    // --------------------------------------------------------
    // CHECK ALREADY PRODUCED
    // --------------------------------------------------------

    const produced =
        await env.DB
            .prepare(`

                SELECT

                    COALESCE(

                        SUM(
                            produced_quantity
                        ),

                        0

                    ) AS total

                FROM production

                WHERE

                    planning_daily_id = ?

                    AND

                    status = 'completed'

            `)

            .bind(
                planningId
            )

            .first();


    const alreadyProduced =
        Number(
            produced?.total || 0
        );


    const plannedQuantity =
        Number(
            plan.planned_quantity
        );


    const remaining =
        plannedQuantity -
        alreadyProduced;


    if (
        producedQuantity >
        remaining
    ) {

        throw new AppError(

            "PROD-010",

            "مقدار تولید بیشتر از مقدار باقی‌مانده برنامه است.",

            409,

            {

                planned:
                    plannedQuantity,

                alreadyProduced,

                remaining,

                requested:
                    producedQuantity

            }

        );

    }


    // --------------------------------------------------------
    // CALCULATE MATERIAL REQUIREMENT
    // --------------------------------------------------------
    //
    // این تابع:
    //
    // ضریب مصرف
    // +
    // درصد ضایعات
    //
    // را در محاسبه لحاظ می‌کند.
    //
    // --------------------------------------------------------

    const materials =
        await calculateMaterialRequirement(

            env,

            plan.bom_id,

            producedQuantity

        );


    // --------------------------------------------------------
    // FIND RAW MATERIAL WAREHOUSE
    // --------------------------------------------------------
    //
    // توجه:
    //
    // این انبار با انبار مقصد محصول فرق دارد.
    //
    // Worker خودش اولین انبار مواد اولیه فعال
    // را پیدا می‌کند.
    //
    // --------------------------------------------------------

    const rawWarehouse =
        await env.DB
            .prepare(`

                SELECT

                    id,

                    code,

                    name

                FROM warehouses

                WHERE

                    warehouse_type =
                    'material'

                    AND

                    status =
                    'active'

                ORDER BY

                    id

                LIMIT 1

            `)
            .first();


    if (!rawWarehouse) {

        throw new AppError(

            "PROD-011",

            "انبار مواد اولیه فعال پیدا نشد.",

            404

        );

    }


    const rawWarehouseId =
        rawWarehouse.id;


    // --------------------------------------------------------
    // CHECK ALL MATERIAL STOCK
    // --------------------------------------------------------
    //
    // قبل از اینکه حتی یک موجودی تغییر کند،
    // موجودی تمام مواد BOM بررسی می‌شود.
    //
    // --------------------------------------------------------

    const stockCheck = [];


    for (
        const material
        of materials
    ) {

        const stock =
            await getInventoryBalance(

                env,

                rawWarehouseId,

                "part",

                material.part_id

            );


        const available =
            Number(
                stock || 0
            );


        const required =
            Number(
                material.required_quantity
            );


        if (
            available <
            required
        ) {

            throw new AppError(

                "PROD-012",

                `موجودی ماده اولیه «${material.part_name}» کافی نیست. موجودی: ${available} موردنیاز: ${required} کسری: ${required - available}`,

                409,

                {

                    part_id:
                        material.part_id,

                    part_name:
                        material.part_name,

                    available,

                    required,

                    shortage:
                        required -
                        available

                }

            );

        }


        stockCheck.push({

            part_id:
                material.part_id,

            part_name:
                material.part_name,

            available,

            required

        });

    }


    // --------------------------------------------------------
    // INSERT PRODUCTION RECORD
    // --------------------------------------------------------

    const productionResult =
        await env.DB
            .prepare(`

                INSERT INTO production
                (

                    product_id,

                    planning_daily_id,

                    produced_quantity,

                    production_date,

                    status,

                    created_by

                )

                VALUES

                (

                    ?,

                    ?,

                    ?,

                    ?,

                    'completed',

                    ?

                )

            `)

            .bind(

                plan.product_id,

                planningId,

                producedQuantity,

                productionDate,

                user.id

            )

            .run();


    const productionId =
        productionResult
            .meta
            .last_row_id;


    // --------------------------------------------------------
    // CONSUME RAW MATERIALS
    // --------------------------------------------------------
    //
    // از انبار مواد اولیه کسر می‌شود.
    //
    // مقدار کسرشده دقیقاً همان مقدار محاسبه‌شده
    // توسط BOM است.
    //
    // --------------------------------------------------------

    for (
        const material
        of materials
    ) {

        await changeInventory(

            env,

            {

                warehouseId:
                    rawWarehouseId,

                itemType:
                    "part",

                itemId:
                    material.part_id,

                delta:
                    -Number(
                        material.required_quantity
                    ),

                transactionType:
                    "PRODUCTION_CONSUMPTION",

                userId:
                    user.id,

                referenceType:
                    "production",

                referenceId:
                    productionId,

                description:
                    `مصرف مواد اولیه برای تولید ${producedQuantity} واحد`

            }

        );

    }


    // --------------------------------------------------------
    // RECEIPT FINISHED PRODUCT
    // --------------------------------------------------------
    //
    // محصول تولیدشده وارد انباری می‌شود که کاربر
    // در فرم انتخاب کرده است.
    //
    // --------------------------------------------------------

    await changeInventory(

        env,

        {

            warehouseId:
                destinationWarehouseId,

            itemType:
                "product",

            itemId:
                plan.product_id,

            delta:
                producedQuantity,

            transactionType:
                "PRODUCTION_RECEIPT",

            userId:
                user.id,

            referenceType:
                "production",

            referenceId:
                productionId,

            description:
                "ورود محصول تولیدشده به انبار"

        }

    );


    // --------------------------------------------------------
    // UPDATE PRODUCTION PLAN STATUS
    // --------------------------------------------------------

    const newProduced =
        alreadyProduced +
        producedQuantity;


    const newStatus =
        newProduced >=
            plannedQuantity
            ? "completed"
            : "in_progress";


    await env.DB
        .prepare(`

            UPDATE planning_daily

            SET

                status = ?

            WHERE

                id = ?

        `)

        .bind(

            newStatus,

            planningId

        )

        .run();


    // --------------------------------------------------------
    // AUDIT
    // --------------------------------------------------------

    await writeAudit(

        env,

        user.id,

        "PRODUCTION",

        "production",

        productionId,

        {

            planningId,

            producedQuantity,

            productionDate,

            destinationWarehouseId,

            destinationWarehouseType:
                destinationWarehouse.warehouse_type,

            rawWarehouseId,

            materials

        }

    );


    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    return {

        production_id:
            productionId,

        message:
            "تولید با موفقیت ثبت شد، مواد اولیه طبق BOM مصرف و محصول تولیدشده وارد انبار شد.",

        produced_quantity:
            producedQuantity,

        total_produced:
            newProduced,

        remaining:
            plannedQuantity -
            newProduced,

        status:
            newStatus,

        raw_material_warehouse_id:
            rawWarehouseId,

        destination_warehouse_id:
            destinationWarehouseId,

        materials

    };

}
// ============================================================
// GET REQUEST ROUTER
// ============================================================

async function handleGet(
    request,
    env,
    user,
    path,
    url
) {

    // --------------------------------------------------------
// DASHBOARD SNAPSHOT
// --------------------------------------------------------

if (
    path ===
    "/api/dashboard"
) {

    return await getDashboardSnapshot(
        env
    );

}
    // --------------------------------------------------------
    // CURRENT USER
    // --------------------------------------------------------

    if (
        path === "/api/me"
    ) {

        return {

            user

        };

    }


    // --------------------------------------------------------
    // UNITS
    // --------------------------------------------------------

    if (
        path === "/api/units"
    ) {

        return {

            items:
                await getUnits(
                    env
                )

        };

    }


    // --------------------------------------------------------
    // PRODUCTS
    // --------------------------------------------------------

    if (
        path === "/api/products"
    ) {

        return {

            items:
                await getProducts(
                    env
                )

        };

    }


    // --------------------------------------------------------
    // PARTS
    // --------------------------------------------------------

    if (
        path === "/api/parts"
    ) {

        return {

            items:
                await getParts(
                    env
                )

        };

    }


    // --------------------------------------------------------
    // PART BY BARCODE
    // --------------------------------------------------------

    if (
        path ===
        "/api/parts/barcode"
    ) {

        const barcode =
            url.searchParams.get(
                "barcode"
            );

        return {

            item:
                await findPartByBarcode(
                    env,
                    barcode
                )

        };

    }


    // --------------------------------------------------------
    // WAREHOUSES
    // --------------------------------------------------------

    if (
        path === "/api/warehouses"
    ) {

        return {

            items:
                await getWarehouses(
                    env
                )

        };

    }


    // --------------------------------------------------------
    // BOMS
    // --------------------------------------------------------

    if (
        path === "/api/boms"
    ) {

        return {

            items:
                await getBoms(
                    env
                )

        };

    }


    // --------------------------------------------------------
    // BOM DETAILS
    // --------------------------------------------------------

    if (
        path ===
        "/api/bom-details"
    ) {

        const bomId =
            url.searchParams.get(
                "bom_id"
            );

        return {

            items:
                await getBomDetails(
                    env,
                    bomId
                )

        };

    }


    // --------------------------------------------------------
    // INVENTORY
    // --------------------------------------------------------

    if (
        path === "/api/inventory"
    ) {

        return {

            items:
                await getInventory(

                    env,

                    {

                        warehouse_id:
                            url.searchParams.get(
                                "warehouse_id"
                            ),

                        item_type:
                            url.searchParams.get(
                                "item_type"
                            )

                    }

                )

        };

    }


    // --------------------------------------------------------
    // PRODUCTION PLANS
    // --------------------------------------------------------

    if (
        path === "/api/planning"
    ) {

        return {

            items:
                await getProductionPlans(
                    env
                )

        };

    }


    // --------------------------------------------------------
    // CALCULATE MATERIAL REQUIREMENT
    // --------------------------------------------------------
    //
    // This endpoint is used by the daily production planning grid.
    //
    // It receives planning_id,
    // then loads BOM and planned quantity directly
    // from planning_daily.
    //
    // No inventory is changed here.
    // --------------------------------------------------------

    if (
        path ===
        "/api/production/material-requirement"
    ) {

        const planningId =
            url.searchParams.get(
                "planning_id"
            );


        const validPlanningId =
            positiveId(
                planningId,
                "برنامه تولید",
                "PLAN-120"
            );


        // --------------------------------------------------------
        // LOAD PRODUCTION PLAN
        // --------------------------------------------------------

        const plan =
            await env.DB
                .prepare(`

                SELECT

                    pl.id,

                    pl.plan_date,

                    pl.bom_id,

                    pl.planned_quantity,

                    pl.status,

                    b.product_id,

                    b.code AS bom_code

                FROM planning_daily pl

                INNER JOIN bom_headers b

                    ON b.id =
                       pl.bom_id

                WHERE

                    pl.id = ?

                LIMIT 1

            `)
                .bind(
                    validPlanningId
                )
                .first();


        if (!plan) {

            throw new AppError(

                "PLAN-121",

                "برنامه تولید پیدا نشد.",

                404

            );

        }


        // --------------------------------------------------------
        // CALCULATE REQUIRED MATERIALS
        // --------------------------------------------------------

        const materials =
            await calculateMaterialRequirement(

                env,

                plan.bom_id,

                plan.planned_quantity

            );


        // --------------------------------------------------------
        // FIND RAW MATERIAL WAREHOUSE
        // --------------------------------------------------------

        const warehouse =
            await env.DB
                .prepare(`

                SELECT

                    id,

                    code,

                    name

                FROM warehouses

                WHERE

                    warehouse_type =
                    'material'

                    AND

                    status =
                    'active'

                ORDER BY

                    id

                LIMIT 1

            `)
                .first();


        if (!warehouse) {

            throw new AppError(

                "PLAN-122",

                "انبار مواد اولیه فعال پیدا نشد.",

                404

            );

        }


        // --------------------------------------------------------
        // CHECK STOCK
        // --------------------------------------------------------

        const stockCheck = [];


        for (
            const material
            of materials
        ) {

            const available =
                Number(

                    await getInventoryBalance(

                        env,

                        warehouse.id,

                        "part",

                        material.part_id

                    ) || 0

                );


            const required =
                Number(
                    material.required_quantity
                );


            stockCheck.push({

                part_id:
                    material.part_id,

                part_code:
                    material.part_code,

                part_name:
                    material.part_name,

                unit_name:
                    material.unit_name,

                required_quantity:
                    required,

                available_quantity:
                    available,

                shortage:
                    Math.max(

                        0,

                        required -
                        available

                    ),

                sufficient:
                    available >=
                    required

            });

        }


        const shortages =
            stockCheck.filter(
                item =>
                    !item.sufficient
            );


        // --------------------------------------------------------
        // RESPONSE
        // --------------------------------------------------------

        return {

            planning_id:
                plan.id,

            plan_date:
                plan.plan_date,

            bom_id:
                plan.bom_id,

            bom_code:
                plan.bom_code,

            product_id:
                plan.product_id,

            planned_quantity:
                Number(
                    plan.planned_quantity
                ),

            warehouse: {

                id:
                    warehouse.id,

                code:
                    warehouse.code,

                name:
                    warehouse.name

            },

            materials:
                stockCheck,

            shortages,

            sufficient:
                shortages.length === 0

        };

    }
    // --------------------------------------------------------
    // PRODUCTION LIST
    // --------------------------------------------------------

    if (
        path === "/api/production"
    ) {

        return {

            items:
                await getProductionList(
                    env
                )

        };

    }

    // --------------------------------------------------------
    // UNKNOWN GET
    // --------------------------------------------------------

    throw new AppError(

        "API-404",

        "مسیر GET موردنظر وجود ندارد.",

        404,

        {

            path

        }

    );

}


// ============================================================
// POST REQUEST ROUTER
// ============================================================

async function handlePost(
    request,
    env,
    user,
    path
) {


    // --------------------------------------------------------
    // UNITS
    // --------------------------------------------------------

    if (
        path === "/api/units"
    ) {

        return await createUnit(

            request,

            env,

            user

        );

    }


    // --------------------------------------------------------
    // PRODUCTS
    // --------------------------------------------------------

    if (
        path === "/api/products"
    ) {

        return await createProduct(

            request,

            env,

            user

        );

    }


    // --------------------------------------------------------
    // PARTS
    // --------------------------------------------------------

    if (
        path === "/api/parts"
    ) {

        return await createPart(

            request,

            env,

            user

        );

    }


    // --------------------------------------------------------
    // BOM
    // --------------------------------------------------------

    if (
        path === "/api/boms"
    ) {

        return await createBom(

            request,

            env,

            user

        );

    }


    // --------------------------------------------------------
    // BOM DETAIL
    // --------------------------------------------------------

    if (
        path ===
        "/api/bom-details"
    ) {

        return await addBomDetail(

            request,

            env,

            user

        );

    }


    // --------------------------------------------------------
    // PRODUCTION PLAN
    // --------------------------------------------------------

    if (
        path ===
        "/api/planning"
    ) {

        return await createProductionPlan(

            request,

            env,

            user

        );

    }


    // --------------------------------------------------------
    // PRODUCTION
    // --------------------------------------------------------

    if (
        path ===
        "/api/production"
    ) {

        return await registerProduction(

            request,

            env,

            user

        );

    }


    // --------------------------------------------------------
    // INVENTORY RECEIPT
    // --------------------------------------------------------

    if (
        path ===
        "/api/inventory/receipt"
    ) {

        const body =
            await readJson(
                request
            );


        // --------------------------------------------------------
        // VALIDATE WAREHOUSE
        // --------------------------------------------------------

        const warehouseId =
            positiveId(

                body.warehouse_id,

                "انبار",

                "INV-100"

            );


        const warehouse =
            await env.DB
                .prepare(`

                SELECT

                    id,

                    code,

                    name,

                    warehouse_type,

                    status

                FROM warehouses

                WHERE id = ?

                LIMIT 1

            `)

                .bind(
                    warehouseId
                )

                .first();


        if (!warehouse) {

            throw new AppError(

                "INV-103",

                "انبار موردنظر پیدا نشد.",

                404

            );

        }


        // --------------------------------------------------------
        // WAREHOUSE MUST BE ACTIVE
        // --------------------------------------------------------

        if (
            warehouse.status !==
            "active"
        ) {

            throw new AppError(

                "INV-104",

                "امکان ورود موجودی به انبار غیرفعال وجود ندارد.",

                409

            );

        }


        // --------------------------------------------------------
        // MANUAL RECEIPT IS ALLOWED ONLY FOR:
        //
        // material = مواد اولیه
        // general  = انبار عمومی
        //
        // finished = FORBIDDEN
        // --------------------------------------------------------

        if (
            ![
                "material",
                "general"
            ].includes(
                warehouse.warehouse_type
            )
        ) {

            if (
                warehouse.warehouse_type ===
                "finished"
            ) {

                throw new AppError(

                    "INV-105",

                    "ورود دستی به انبار محصول نهایی مجاز نیست. محصول نهایی فقط از طریق ثبت تولید وارد انبار می‌شود.",

                    409,

                    {

                        warehouse_id:
                            warehouse.id,

                        warehouse_type:
                            warehouse.warehouse_type

                    }

                );

            }


            throw new AppError(

                "INV-106",

                "ورود دستی برای این نوع انبار مجاز نیست.",

                409,

                {

                    warehouse_id:
                        warehouse.id,

                    warehouse_type:
                        warehouse.warehouse_type

                }

            );

        }


        // --------------------------------------------------------
        // DETERMINE ITEM TYPE
        //
        // material → part
        // general  → product
        // --------------------------------------------------------

        let itemType;

        let itemId;


        if (
            warehouse.warehouse_type ===
            "material"
        ) {

            itemType =
                "part";


            itemId =
                positiveId(

                    body.part_id,

                    "قطعه",

                    "INV-101"

                );

        }

        else if (
            warehouse.warehouse_type ===
            "general"
        ) {

            itemType =
                "product";


            itemId =
                positiveId(

                    body.product_id,

                    "محصول",

                    "INV-107"

                );

        }


        // --------------------------------------------------------
        // VALIDATE QUANTITY
        // --------------------------------------------------------

        const quantity =
            positiveNumber(

                body.quantity,

                "مقدار ورود",

                "INV-102"

            );


        // --------------------------------------------------------
        // UPDATE INVENTORY
        // --------------------------------------------------------

        const balance =
            await changeInventory(

                env,

                {

                    warehouseId,

                    itemType,

                    itemId,

                    delta:
                        quantity,

                    transactionType:
                        "RECEIPT",

                    userId:
                        user.id,

                    referenceType:
                        body.reference_type ||
                        "manual",

                    referenceId:
                        body.reference_id ||
                        null,

                    description:
                        body.description ||
                        (
                            warehouse.warehouse_type ===
                                "material"

                                ? "ورود مواد اولیه"

                                : "ورود کالای خریداری‌شده به انبار عمومی"
                        )

                }

            );


        // --------------------------------------------------------
        // AUDIT
        // --------------------------------------------------------

        await writeAudit(

            env,

            user.id,

            "INVENTORY_RECEIPT",

            itemType === "part"
                ? "parts"
                : "products",

            itemId,

            {

                ...body,

                warehouse_id:
                    warehouseId,

                warehouse_type:
                    warehouse.warehouse_type,

                item_type:
                    itemType,

                item_id:
                    itemId

            }

        );


        return {

            message:
                "ورود موجودی با موفقیت ثبت شد.",

            balance,

            warehouse: {

                id:
                    warehouse.id,

                code:
                    warehouse.code,

                name:
                    warehouse.name,

                type:
                    warehouse.warehouse_type

            },

            item_type:
                itemType,

            item_id:
                itemId

        };

    }

    // --------------------------------------------------------
    // INVENTORY ISSUE
    // --------------------------------------------------------

    if (
        path ===
        "/api/inventory/issue"
    ) {

        const body =
            await readJson(
                request
            );

        const warehouseId =
            positiveId(

                body.warehouse_id,

                "انبار",

                "INV-110"

            );

        const partId =
            positiveId(

                body.part_id,

                "قطعه",

                "INV-111"

            );

        const quantity =
            positiveNumber(

                body.quantity,

                "مقدار مصرف",

                "INV-112"

            );

        const balance =
            await changeInventory(

                env,

                {

                    warehouseId,

                    itemType:
                        "part",

                    itemId:
                        partId,

                    delta:
                        -quantity,

                    transactionType:
                        "ISSUE",

                    userId:
                        user.id,

                    referenceType:
                        body.reference_type ||
                        "manual",

                    referenceId:
                        body.reference_id ||
                        null,

                    description:
                        body.description ||
                        "خروج مواد اولیه"

                }

            );

        await writeAudit(

            env,

            user.id,

            "INVENTORY_ISSUE",

            "parts",

            partId,

            body

        );

        return {

            message:
                "خروج موجودی با موفقیت ثبت شد.",

            balance

        };

    }


    // --------------------------------------------------------
    // UNKNOWN POST
    // --------------------------------------------------------

    throw new AppError(

        "API-405",

        "عملیات POST موردنظر وجود ندارد.",

        404,

        {

            path

        }

    );

}
// ============================================================
// UPDATE PRODUCT
// ============================================================

async function updateProduct(
    request,
    env,
    user
) {

    const body =
        await readJson(
            request
        );


    // --------------------------------------------------------
    // PRODUCT ID
    // --------------------------------------------------------

    const productId =
        positiveId(
            body.id,
            "محصول",
            "PROD-UPDATE-001"
        );


    // --------------------------------------------------------
    // READ FIELDS
    // --------------------------------------------------------

    const code =
        String(
            body.code || ""
        ).trim();

    const name =
        String(
            body.name || ""
        ).trim();

    const unitId =
        positiveId(
            body.unit_id,
            "واحد اندازه‌گیری",
            "PROD-UPDATE-002"
        );


    // --------------------------------------------------------
    // VALIDATE BASIC DATA
    // --------------------------------------------------------

    if (!code) {

        throw new AppError(

            "PROD-UPDATE-003",

            "کد محصول الزامی است.",

            400

        );

    }


    if (!name) {

        throw new AppError(

            "PROD-UPDATE-004",

            "نام محصول الزامی است.",

            400

        );

    }


    // --------------------------------------------------------
    // STATUS
    // --------------------------------------------------------

    const status =
        body.status === "inactive"
            ? "inactive"
            : "active";


    // --------------------------------------------------------
    // CHECK PRODUCT
    // --------------------------------------------------------

    const product =
        await env.DB
            .prepare(`

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            SELECT

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                id,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    code,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        name,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            unit_id,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                status

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                FROM products

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                WHERE id = ?

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                LIMIT 1

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            `)
            .bind(
                productId
            )
            .first();


    if (!product) {

        throw new AppError(

            "PROD-UPDATE-005",

            "محصول موردنظر پیدا نشد.",

            404

        );

    }


    // --------------------------------------------------------
    // CHECK UNIT
    // --------------------------------------------------------

    const unit =
        await env.DB
            .prepare(`

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                SELECT

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    id,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        status

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        FROM units

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        WHERE id = ?

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        LIMIT 1

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    `)
            .bind(
                unitId
            )
            .first();


    if (!unit) {

        throw new AppError(

            "PROD-UPDATE-006",

            "واحد اندازه‌گیری انتخاب‌شده وجود ندارد.",

            404

        );

    }


    if (
        unit.status !==
        "active"
    ) {

        throw new AppError(

            "PROD-UPDATE-007",

            "واحد اندازه‌گیری انتخاب‌شده فعال نیست.",

            409

        );

    }


    // --------------------------------------------------------
    // CHECK DUPLICATE CODE
    // --------------------------------------------------------

    const duplicate =
        await env.DB
            .prepare(`

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        SELECT

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            id

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            FROM products

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            WHERE

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                code = ?

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    AND

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        id != ?

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        LIMIT 1

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    `)
            .bind(

                code,

                productId

            )
            .first();


    if (duplicate) {

        throw new AppError(

            "PROD-UPDATE-008",

            "این کد محصول قبلاً برای محصول دیگری ثبت شده است.",

            409

        );

    }


    // --------------------------------------------------------
    // UPDATE
    // --------------------------------------------------------

    await env.DB
        .prepare(`

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        UPDATE products

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    SET

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    code = ?,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    name = ?,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    unit_id = ?,

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    status = ?

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                WHERE

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                id = ?

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        `)
        .bind(

            code,

            name,

            unitId,

            status,

            productId

        )
        .run();


    // --------------------------------------------------------
    // AUDIT
    // --------------------------------------------------------

    await writeAudit(

        env,

        user.id,

        "UPDATE",

        "products",

        productId,

        {

            before: {

                code:
                    product.code,

                name:
                    product.name,

                unit_id:
                    product.unit_id,

                status:
                    product.status

            },

            after: {

                code,

                name,

                unit_id:
                    unitId,

                status

            }

        }

    );


    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    return {

        id:
            productId,

        message:
            "محصول با موفقیت ویرایش شد."

    };

}
// ============================================================
// PUT REQUEST ROUTER
// ============================================================

async function handlePut(
    request,
    env,
    user,
    path
) {


    // --------------------------------------------------------
    // // UPDATE PRODUCT
    // --------------------------------------------------------

    if (
        path === "/api/products"
    ) {

        return await updateProduct(

            request,

            env,

            user

        );

    }              // --------------------------------------------------------
    // UPDATE UNIT
    // --------------------------------------------------------

    if (
        path.startsWith(
            "/api/units/"
        )
    ) {

        return await updateUnit(

            request,

            env,

            user,

            path

        );

    }


    // --------------------------------------------------------
    // UPDATE PRODUCTION PLAN
    // --------------------------------------------------------

    if (
        path === "/api/planning" ||
        path.startsWith("/api/planning/")
    ) {

        const planningId =
            path.startsWith("/api/planning/")
                ? path.split("/").pop()
                : null;


        const body =
            await readJson(
                request
            );


        if (planningId) {

            body.id =
                planningId;

        }


        const updatedRequest =
            new Request(

                request,

                {

                    body:
                        JSON.stringify(
                            body
                        )

                }

            );


        return await updateProductionPlan(

            updatedRequest,

            env,

            user

        );

    }



    // --------------------------------------------------------
    // UNKNOWN PUT
    // --------------------------------------------------------

    throw new AppError(

        "API-405",

        "عملیات PUT برای مسیر موردنظر وجود ندارد.",

        405,

        {

            path

        }

    );

}


// ============================================================
// // UPDATE UNIT
// ============================================================

async function updateUnit(
    request,
    env,
    user,
    path
) {

    // --------------------------------------------------------
    // GET UNIT ID FROM URL
    // --------------------------------------------------------

    const idText =
        path.split("/").pop();


    const unitId =
        positiveId(

            idText,

            "واحد",

            "UNIT-001"

        );


    // --------------------------------------------------------
    // READ REQUEST BODY
    // --------------------------------------------------------

    const body =
        await readJson(
            request
        );


    // --------------------------------------------------------
    // VALIDATE CODE
    // --------------------------------------------------------

    const code =
        String(
            body.code ||
            ""
        ).trim();


    if (!code) {

        throw new AppError(

            "UNIT-002",

            "کد واحد الزامی است.",

            400

        );

    }


    // --------------------------------------------------------
    // VALIDATE NAME
    // --------------------------------------------------------

    const name =
        String(
            body.name ||
            ""
        ).trim();


    if (!name) {

        throw new AppError(

            "UNIT-003",

            "نام واحد الزامی است.",

            400

        );

    }


    // --------------------------------------------------------
    // CHECK UNIT EXISTS
    // --------------------------------------------------------

    const existing =
        await env.DB
            .prepare(`
                                                                                                                                                                                                                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                                                                                                                                                                                        SELECT
                                                                                                                                                                                                                                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                                                                                                                                                                                                            id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                            
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                code,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    name,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        status
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        FROM units
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        WHERE
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            id = ?
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            LIMIT 1
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        `)

            .bind(
                unitId
            )

            .first();


    if (!existing) {

        throw new AppError(

            "UNIT-004",

            "واحد موردنظر پیدا نشد.",

            404

        );

    }


    // --------------------------------------------------------
    // CHECK DUPLICATE CODE
    // --------------------------------------------------------

    const duplicate =
        await env.DB
            .prepare(`
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            SELECT
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                FROM units
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                WHERE
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    code = ?
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        AND
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            id <> ?
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            LIMIT 1
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        `)

            .bind(

                code,

                unitId

            )

            .first();


    if (duplicate) {

        throw new AppError(

            "UNIT-005",

            "کد واحد تکراری است.",

            409,

            {

                code

            }

        );

    }


    // --------------------------------------------------------
    // UPDATE UNIT
    // --------------------------------------------------------

    await env.DB
        .prepare(`
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    UPDATE units
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                SET
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                code = ?,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                name = ?
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            WHERE
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            id = ?
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    `)

        .bind(

            code,

            name,

            unitId

        )

        .run();


    // --------------------------------------------------------
    // AUDIT
    // --------------------------------------------------------

    await writeAudit(

        env,

        user.id,

        "UPDATE",

        "units",

        unitId,

        {

            before: {

                code:
                    existing.code,

                name:
                    existing.name

            },

            after: {

                code,

                name

            }

        }

    );


    // --------------------------------------------------------
    // RESPONSE
    // --------------------------------------------------------

    return {

        id:
            unitId,

        message:
            "واحد با موفقیت ویرایش شد."

    };

}      
// ============================================================
// DASHBOARD ANALYTICS RULES
// ============================================================

const DASHBOARD_RULES = {

    achievement: {

        green: 90,

        yellow: 60

    },

    material: {

        green: "sufficient",

        red: "shortage"

    }

};


// ============================================================
// PRODUCTION SEVERITY
// ============================================================

function getDashboardProductionSeverity(

    plannedQuantity,

    producedQuantity

){

    const planned =
        Number(
            plannedQuantity || 0
        );

    const produced =
        Number(
            producedQuantity || 0
        );


    if(planned <= 0){

        return {

            severity:
                "yellow",

            code:
                "NO_PLAN",

            message:
                "مقدار برنامه تولید معتبر نیست."

        };

    }


    const achievement =
        (
            produced /
            planned
        ) *
        100;


    if(
        achievement >=
        DASHBOARD_RULES
            .achievement
            .green
    ){

        return {

            severity:
                "green",

            code:
                "ON_TRACK",

            message:
                `تحقق تولید ${achievement.toFixed(1)}٪ است.`

        };

    }


    if(
        achievement >=
        DASHBOARD_RULES
            .achievement
            .yellow
    ){

        return {

            severity:
                "yellow",

            code:
                "AT_RISK",

            message:
                `تحقق تولید ${achievement.toFixed(1)}٪ است و نیاز به پیگیری دارد.`

        };

    }


    return {

        severity:
            "red",

        code:
            "CRITICAL",

        message:
            `تحقق تولید فقط ${achievement.toFixed(1)}٪ است.`

    };

}
// ============================================================
// GET CURRENT INVENTORY BALANCE
// ============================================================

async function getDashboardInventoryBalance(

    env,

    warehouseId,

    itemType,

    itemId

){

    const result =
        await env.DB
            .prepare(`

                SELECT

                    COALESCE(
                        SUM(quantity),
                        0
                    ) AS quantity

                FROM inventory_balances

                WHERE
                    item_type = ?

                    AND

                    item_id = ?

                    AND

                    (
                        ? IS NULL
                        OR warehouse_id = ?
                    )

            `)
            .bind(

                itemType,

                itemId,

                warehouseId || null,

                warehouseId || null

            )
            .first();


    return Number(
        result?.quantity || 0
    );

}

// ============================================================
// DASHBOARD INVENTORY SUMMARY
// ============================================================

async function getDashboardInventorySummary(
    env
){

    const result =
        await env.DB
            .prepare(`

                SELECT

                    item_type,

                    COUNT(*) AS item_count,

                    SUM(
                        CASE
                            WHEN quantity > 0
                            THEN 1
                            ELSE 0
                        END
                    ) AS positive_items,

                    SUM(
                        CASE
                            WHEN quantity = 0
                            THEN 1
                            ELSE 0
                        END
                    ) AS zero_items

                FROM inventory_balances

                GROUP BY
                    item_type

            `)
            .all();


    const rows =
        result.results || [];


    let parts = {

        item_count: 0,

        positive_items: 0,

        zero_items: 0

    };


    let products = {

        item_count: 0,

        positive_items: 0,

        zero_items: 0

    };


    for(
        const row
        of rows
    ){

        const target =
            row.item_type ===
            "part"

                ? parts

                : products;


        target.item_count =
            Number(
                row.item_count || 0
            );


        target.positive_items =
            Number(
                row.positive_items || 0
            );


        target.zero_items =
            Number(
                row.zero_items || 0
            );

    }


    return {

        parts,

        products,

        total_item_lines:
            parts.item_count +
            products.item_count,

        positive_item_lines:
            parts.positive_items +
            products.positive_items,

        zero_item_lines:
            parts.zero_items +
            products.zero_items

    };

}

// ============================================================
// DASHBOARD MATERIAL REQUIREMENT
// ============================================================

async function getDashboardMaterialRequirements(

    env,

    planningRow,

    remainingProductQuantity

){

    const bomId =
        Number(
            planningRow.bom_id
        );


    if(
        !bomId ||
        remainingProductQuantity <= 0
    ){

        return [];

    }


    const warehouse =
        await env.DB
            .prepare(`

                SELECT

                    id

                FROM warehouses

                WHERE

                    warehouse_type =
                    'material'

                    AND

                    status =
                    'active'

                ORDER BY
                    id

                LIMIT 1

            `)
            .first();


    if(!warehouse){

        return [];

    }


    const materialsResult =
        await env.DB
            .prepare(`

                SELECT

                    bd.part_id,

                    bd.consumption_factor,

                    bd.scrap_percent,

                    p.code AS part_code,

                    p.name AS part_name,

                    u.name AS unit_name

                FROM bom_details bd

                INNER JOIN parts p

                    ON p.id =
                       bd.part_id

                INNER JOIN units u

                    ON u.id =
                       p.unit_id

                WHERE

                    bd.bom_id = ?

                    AND

                    bd.status =
                    'active'

                    AND

                    p.status =
                    'active'

                ORDER BY
                    bd.id

            `)
            .bind(
                bomId
            )
            .all();


    const materials =
        materialsResult.results || [];


    const rows = [];


    for(
        const material
        of materials
    ){

        const factor =
            Number(
                material.consumption_factor || 0
            );


        const scrap =
            Number(
                material.scrap_percent || 0
            );


        const requiredQuantity =

            factor *
            remainingProductQuantity *
            (
                1 +
                scrap / 100
            );


        const availableQuantity =
            await getDashboardInventoryBalance(

                env,

                warehouse.id,

                "part",

                material.part_id

            );


        const shortageQuantity =
            Math.max(

                0,

                requiredQuantity -
                availableQuantity

            );


        const sufficient =
            shortageQuantity <= 0;


        let severity =
            "green";


        let severityCode =
            "AVAILABLE";


        let severityMessage =
            "موجودی مواد اولیه برای ادامه تولید کافی است.";


        if(!sufficient){

            severity =
                "red";


            severityCode =
                "MATERIAL_SHORTAGE";


            severityMessage =
                `برای ${material.part_name} مقدار ${shortageQuantity} کسری وجود دارد.`;

        }


        rows.push({

            snapshot_id:
                null,

            planning_id:
                planningRow.planning_id,

            product_id:
                planningRow.product_id,

            bom_id:
                bomId,

            warehouse_id:
                warehouse.id,

            part_id:
                material.part_id,

            part_code:
                material.part_code,

            part_name:
                material.part_name,

            unit_name:
                material.unit_name,

            planned_quantity:
                Number(
                    planningRow.planned_quantity || 0
                ),

            produced_quantity:
                Number(
                    planningRow.produced_quantity || 0
                ),

            remaining_product_quantity,

            consumption_factor:
                factor,

            scrap_percent:
                scrap,

            required_quantity:
                requiredQuantity,

            available_quantity:
                availableQuantity,

            shortage_quantity:
                shortageQuantity,

            sufficient:
                sufficient
                    ? 1
                    : 0,

            severity,

            severity_code:
                severityCode,

            severity_message:
                severityMessage

        });

    }


    return rows;

}

// ============================================================
// BUILD DASHBOARD SNAPSHOT
// ============================================================

async function buildDashboardSnapshot(
    env,
    businessDate
){

    const snapshotAt =
        new Date().toISOString();


    const details =
        await getDashboardProductionDetails(

            env,

            businessDate

        );


    let totalPlanned =
        0;


    let totalProduced =
        0;


    let totalRemaining =
        0;


    let activePlans =
        0;


    let completedPlans =
        0;


    let notStartedPlans =
        0;


    let productsOnTrack =
        0;


    let productsAtRisk =
        0;


    let productsCritical =
        0;


    let materialShortagePlans =
        0;


    let materialShortageItems =
        0;


    const detailRows =
        [];


    const materialRows =
        [];


    for(
        const row
        of details
    ){

        const planned =
            Number(
                row.planned_quantity || 0
            );


        const produced =
            Number(
                row.produced_quantity || 0
            );


        const remaining =
            Math.max(

                0,

                planned -
                produced

            );


        const achievement =
            planned > 0

                ? (
                    produced /
                    planned
                ) * 100

                : 0;


        totalPlanned +=
            planned;


        totalProduced +=
            produced;


        totalRemaining +=
            remaining;


        const severity =
            getDashboardProductionSeverity(

                planned,

                produced

            );


        if(
            severity.severity ===
            "green"
        ){

            productsOnTrack++;

        }

        else if(
            severity.severity ===
            "yellow"
        ){

            productsAtRisk++;

        }

        else{

            productsCritical++;

        }


        if(
            row.plan_status ===
            "completed"
        ){

            completedPlans++;

        }

        else if(
            row.plan_status ===
            "in_progress"
        ){

            activePlans++;

        }

        else{

            notStartedPlans++;

        }


        detailRows.push({

            detail_type:
                "production_plan",

            entity_id:
                row.planning_id,

            planning_id:
                row.planning_id,

            product_id:
                row.product_id,

            bom_id:
                row.bom_id,

            plan_date:
                row.plan_date,

            product_code:
                row.product_code,

            product_name:
                row.product_name,

            bom_code:
                row.bom_code,

            planned_quantity:
                planned,

            produced_quantity:
                produced,

            remaining_quantity:
                remaining,

            achievement_percent:
                achievement,

            status:
                row.plan_status,

            severity:
                severity.severity,

            severity_code:
                severity.code,

            severity_message:
                severity.message

        });


        // ----------------------------------------------------
        // MATERIAL ANALYSIS
        // ----------------------------------------------------

        const materials =
            await getDashboardMaterialRequirements(

                env,

                row,

                remaining

            );


        let hasMaterialShortage =
            false;


        for(
            const material
            of materials
        ){

            materialRows.push(
                material
            );


            if(
                material.sufficient !== 1
            ){

                hasMaterialShortage =
                    true;


                materialShortageItems++;

            }

        }


        if(
            hasMaterialShortage
        ){

            materialShortagePlans++;

        }

    }


    const totalPlans =
        details.length;


    const totalProducts =
        new Set(

            details.map(
                item =>
                    item.product_id
            )

        ).size;


    const achievementPercent =
        totalPlanned > 0

            ? (
                totalProduced /
                totalPlanned
            ) * 100

            : 0;


    const inventorySummary =
        await getDashboardInventorySummary(
            env
        );


    // --------------------------------------------------------
    // ALERTS
    // --------------------------------------------------------

    const greenAlerts =
        productsOnTrack;


    const yellowAlerts =
        productsAtRisk +
        materialShortagePlans;


    const redAlerts =
        productsCritical +
        materialShortageItems;


    // --------------------------------------------------------
    // CREATE SNAPSHOT
    // --------------------------------------------------------

    const snapshotResult =
        await env.DB
            .prepare(`

                INSERT INTO dashboard_snapshots (

                    snapshot_at,

                    business_date,

                    total_planned,

                    total_produced,

                    total_remaining,

                    achievement_percent,

                    total_plans,

                    active_plans,

                    completed_plans,

                    not_started_plans,

                    total_products,

                    products_on_track,

                    products_at_risk,

                    products_critical,

                    inventory_item_count,

                    inventory_total,

                    green_alerts,

                    yellow_alerts,

                    red_alerts

                )

                VALUES (

                    ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?

                )

            `)
            .bind(

                snapshotAt,

                businessDate,

                totalPlanned,

                totalProduced,

                totalRemaining,

                achievementPercent,

                totalPlans,

                activePlans,

                completedPlans,

                notStartedPlans,

                totalProducts,

                productsOnTrack,

                productsAtRisk,

                productsCritical,

                inventorySummary
                    .positive_item_lines,

                null,

                greenAlerts,

                yellowAlerts,

                redAlerts

            )
            .run();


    const snapshotId =
        snapshotResult
            .meta
            .last_row_id;


    // --------------------------------------------------------
    // PRODUCTION DETAILS
    // --------------------------------------------------------

    for(
        const detail
        of detailRows
    ){

        await env.DB
            .prepare(`

                INSERT INTO
                dashboard_snapshot_details (

                    snapshot_id,

                    detail_type,

                    entity_id,

                    planning_id,

                    product_id,

                    bom_id,

                    plan_date,

                    product_code,

                    product_name,

                    bom_code,

                    planned_quantity,

                    produced_quantity,

                    remaining_quantity,

                    achievement_percent,

                    status,

                    severity,

                    severity_code,

                    severity_message

                )

                VALUES (

                    ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?

                )

            `)
            .bind(

                snapshotId,

                detail.detail_type,

                detail.entity_id,

                detail.planning_id,

                detail.product_id,

                detail.bom_id,

                detail.plan_date,

                detail.product_code,

                detail.product_name,

                detail.bom_code,

                detail.planned_quantity,

                detail.produced_quantity,

                detail.remaining_quantity,

                detail.achievement_percent,

                detail.status,

                detail.severity,

                detail.severity_code,

                detail.severity_message

            )
            .run();

    }


    // --------------------------------------------------------
    // MATERIAL DETAILS
    // --------------------------------------------------------

    for(
        const material
        of materialRows
    ){

        await env.DB
            .prepare(`

                INSERT INTO
                dashboard_snapshot_materials (

                    snapshot_id,

                    planning_id,

                    product_id,

                    bom_id,

                    warehouse_id,

                    part_id,

                    part_code,

                    part_name,

                    unit_name,

                    planned_quantity,

                    produced_quantity,

                    remaining_product_quantity,

                    consumption_factor,

                    scrap_percent,

                    required_quantity,

                    available_quantity,

                    shortage_quantity,

                    sufficient,

                    severity,

                    severity_code,

                    severity_message

                )

                VALUES (

                    ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?

                )

            `)
            .bind(

                snapshotId,

                material.planning_id,

                material.product_id,

                material.bom_id,

                material.warehouse_id,

                material.part_id,

                material.part_code,

                material.part_name,

                material.unit_name,

                material.planned_quantity,

                material.produced_quantity,

                material.remaining_product_quantity,

                material.consumption_factor,

                material.scrap_percent,

                material.required_quantity,

                material.available_quantity,

                material.shortage_quantity,

                material.sufficient,

                material.severity,

                material.severity_code,

                material.severity_message

            )
            .run();

    }


    return {

        snapshot_id:
            snapshotId,

        snapshot_at:
            snapshotAt,

        business_date:
            businessDate,

        total_planned:
            totalPlanned,

        total_produced:
            totalProduced,

        total_remaining:
            totalRemaining,

        achievement_percent:
            achievementPercent,

        total_plans:
            totalPlans,

        active_plans:
            activePlans,

        completed_plans:
            completedPlans,

        not_started_plans:
            notStartedPlans,

        total_products:
            totalProducts,

        inventory:
            inventorySummary,

        green_alerts:
            greenAlerts,

        yellow_alerts:
            yellowAlerts,

        red_alerts:
            redAlerts,

        material_shortage_plans:
            materialShortagePlans,

        material_shortage_items:
            materialShortageItems

    };

}

// ============================================================
// CLEAN DASHBOARD HISTORY
// ============================================================

async function cleanupDashboardSnapshots(
    env
){

    await env.DB
        .prepare(`

            DELETE FROM
            dashboard_snapshot_materials

            WHERE snapshot_id IN (

                SELECT id

                FROM dashboard_snapshots

                WHERE snapshot_at <
                    datetime(
                        'now',
                        '-30 days'
                    )

            )

        `)
        .run();


    await env.DB
        .prepare(`

            DELETE FROM
            dashboard_snapshot_details

            WHERE snapshot_id IN (

                SELECT id

                FROM dashboard_snapshots

                WHERE snapshot_at <
                    datetime(
                        'now',
                        '-30 days'
                    )

            )

        `)
        .run();


    await env.DB
        .prepare(`

            DELETE FROM
            dashboard_snapshots

            WHERE snapshot_at <
                datetime(
                    'now',
                    '-30 days'
                )

        `)
        .run();

}

// ============================================================
// REFRESH DASHBOARD SNAPSHOT
// ============================================================

async function refreshDashboardSnapshot(
    env
){

    const businessDate =
        new Date()
            .toISOString()
            .slice(
                0,
                10
            );


    await cleanupDashboardSnapshots(
        env
    );


    return await buildDashboardSnapshot(

        env,

        businessDate

    );

}

// ============================================================
// GET DASHBOARD SNAPSHOT
// ============================================================

async function getDashboardSnapshot(
    env
){

    const snapshot =
        await env.DB
            .prepare(`

                SELECT *

                FROM dashboard_snapshots

                ORDER BY
                    snapshot_at DESC

                LIMIT 1

            `)
            .first();


    if(!snapshot){

        return {

            snapshot:
                null,

            details:
                [],

            materials:
                [],

            message:
                "هنوز Snapshot داشبورد ساخته نشده است."

        };

    }


    const detailsResult =
        await env.DB
            .prepare(`

                SELECT *

                FROM dashboard_snapshot_details

                WHERE
                    snapshot_id = ?

                ORDER BY

                    CASE severity

                        WHEN 'red'
                        THEN 1

                        WHEN 'yellow'
                        THEN 2

                        ELSE 3

                    END,

                    product_name,

                    planning_id

            `)
            .bind(
                snapshot.id
            )
            .all();


    const materialsResult =
        await env.DB
            .prepare(`

                SELECT *

                FROM dashboard_snapshot_materials

                WHERE
                    snapshot_id = ?

                ORDER BY

                    CASE severity

                        WHEN 'red'
                        THEN 1

                        WHEN 'yellow'
                        THEN 2

                        ELSE 3

                    END,

                    planning_id,

                    part_name

            `)
            .bind(
                snapshot.id
            )
            .all();


    return {

        snapshot,

        details:
            detailsResult.results ||
            [],

        materials:
            materialsResult.results ||
            []

    };

}
// ============================================================
// DELETE SESSION / FUTURE DELETE ROUTES
// ============================================================

async function handleDelete(
    request,
    env,
    user,
    path
) {

    throw new AppError(

        "API-405",

        "عملیات حذف در این نسخه برای این مسیر فعال نشده است.",

        405,

        {

            path

        }

    );

}


// ============================================================
// MAIN WORKER
// ============================================================

export default {

    async fetch(
        request,
        env
    ) {

        const origin =
            request.headers.get(
                "Origin"
            ) || "*";

        // ----------------------------------------------------
        // CORS PREFLIGHT
        // ----------------------------------------------------

        if (
            request.method ===
            "OPTIONS"
        ) {

            return new Response(
                null,
                {

                    status: 204,

                    headers:
                        responseHeaders(
                            origin
                        )

                }
            );

        }


        const url =
            new URL(
                request.url
            );

        const path =
            url.pathname
                .replace(
                    /\/+$/,
                    ""
                ) || "/";


        try {


            // =================================================
            // HEALTH
            // =================================================

            if (
                path ===
                "/api/health"
                &&
                request.method ===
                "GET"
            ) {

                return successResponse(

                    {

                        service:
                            APP_NAME,

                        worker:
                            WORKER_NAME,

                        database:
                            DATABASE_NAME,

                        binding:
                            "DB",

                        version:
                            API_VERSION,

                        status:
                            "online"

                    },

                    200,

                    origin

                );

            }


            // =================================================
            // LOGIN
            // =================================================

            if (
                path ===
                "/api/login"
                &&
                request.method ===
                "POST"
            ) {

                const result =
                    await login(

                        request,

                        env

                    );

                return successResponse(

                    {

                        message:
                            "ورود با موفقیت انجام شد.",

                        token:
                            result.token,

                        user:
                            result.user

                    },

                    200,

                    origin

                );

            }


            // =================================================
            // LOGOUT
            // =================================================

            if (
                path ===
                "/api/logout"
                &&
                request.method ===
                "POST"
            ) {

                const result =
                    await logout(

                        request,

                        env

                    );

                return successResponse(

                    result,

                    200,

                    origin

                );

            }


            // =================================================
            // EVERYTHING ELSE
            // REQUIRES AUTHENTICATION
            // =================================================

            const user =
                await authenticate(

                    request,

                    env

                );


            // =================================================
            // GET
            // =================================================

            if (
                request.method ===
                "GET"
            ) {

                const result =
                    await handleGet(

                        request,

                        env,

                        user,

                        path,

                        url

                    );

                return successResponse(

                    result,

                    200,

                    origin

                );

            }


            // =================================================
            // POST
            // =================================================

            if (
                request.method ===
                "POST"
            ) {

                const result =
                    await handlePost(

                        request,

                        env,

                        user,

                        path

                    );

                return successResponse(

                    result,

                    201,

                    origin

                );

            }

            // =================================================
            // PUT
            // =================================================

            if (
                request.method ===
                "PUT"
            ) {

                const result =
                    await handlePut(

                        request,

                        env,

                        user,

                        path

                    );

                return successResponse(

                    result,

                    200,

                    origin

                );

            }
            // =================================================
            // DELETE
            // =================================================

            if (
                request.method ===
                "DELETE"
            ) {

                const result =
                    await handleDelete(

                        request,

                        env,

                        user,

                        path

                    );

                return successResponse(

                    result,

                    200,

                    origin

                );

            }


            // =================================================
            // METHOD NOT ALLOWED
            // =================================================

            throw new AppError(

                "API-405",

                "این نوع درخواست برای مسیر موردنظر مجاز نیست.",

                405,

                {

                    method:
                        request.method,

                    path

                }

            );

        }


        // =====================================================
        // CONTROLLED ERROR HANDLER
        // =====================================================

        catch (error) {

            console.error(

                "NINIT0_API_ERROR",

                {

                    path,

                    method:
                        request.method,

                    error

                }

            );


            if (
                error instanceof
                AppError
            ) {

                return errorResponse(

                    error.code,

                    error.message,

                    error.status,

                    error.details,

                    origin

                );

            }


            // -------------------------------------------------
            // DATABASE ERROR
            // -------------------------------------------------

            if (
                error?.message
            ) {

                const text =
                    String(
                        error.message
                    );


                if (
                    text.includes(
                        "no such table"
                    )
                ) {

                    return errorResponse(

                        "DB-001",

                        "جدول موردنیاز در دیتابیس پیدا نشد. ابتدا فایل Schema را روی D1 اجرا کنید.",

                        500,

                        null,

                        origin

                    );

                }


                if (
                    text.includes(
                        "no such column"
                    )
                ) {

                    return errorResponse(

                        "DB-002",

                        "ساختار ستون‌های دیتابیس با نسخه Worker هماهنگ نیست. Schema را بررسی کنید.",

                        500,

                        null,

                        origin

                    );

                }


                if (
                    text.includes(
                        "UNIQUE constraint"
                    )
                ) {

                    return errorResponse(

                        "DB-003",

                        "اطلاعات تکراری است و امکان ثبت آن وجود ندارد.",

                        409,

                        null,

                        origin

                    );

                }


                if (
                    text.includes(
                        "FOREIGN KEY constraint"
                    )
                ) {

                    return errorResponse(

                        "DB-004",

                        "اطلاعات مرتبط پیدا نشد و عملیات قابل انجام نیست.",

                        409,

                        null,

                        origin

                    );

                }

            }


            // -------------------------------------------------
            // UNKNOWN SYSTEM ERROR
            // -------------------------------------------------

            return errorResponse(

                "SYS-001",

                "خطای غیرمنتظره‌ای در سامانه رخ داد. لطفاً دوباره تلاش کنید.",

                500,

                null,

                origin

            );

        }

    }

};
