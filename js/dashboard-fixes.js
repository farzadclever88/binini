/* ============================================================
   DASHBOARD FIXES
============================================================ */

(function(){

    "use strict";


    /* ========================================================
       1. FIX DASHBOARD DRILL-DOWN MODAL
       Modal قبلی باید قبل از Modal جزئیات بسته شود.
    ======================================================== */

    function installDashboardDetailsFix(){

        if(
            typeof window.loadDashboardDetails !== "function"
        ){

            return false;

        }


        if(
            window.__dashboardDetailsFixed
        ){

            return true;

        }


        const originalLoadDashboardDetails =
            window.loadDashboardDetails;


        window.loadDashboardDetails =
            async function(
                planningId,
                productId
            ){

                /*
                 * Modal فهرست وضعیت را ببند.
                 * در غیر این صورت Details پشت آن قرار می‌گیرد.
                 */

                document
                    .querySelectorAll(
                        "#dashboardModalOverlay"
                    )
                    .forEach(
                        element => element.remove()
                    );


                /*
                 * اگر Details قبلی وجود دارد،
                 * قبل از باز کردن Details جدید حذف شود.
                 */

                document
                    .querySelectorAll(
                        "#dashboardDetailsModal"
                    )
                    .forEach(
                        element => element.remove()
                    );


                return await originalLoadDashboardDetails(
                    planningId,
                    productId
                );

            };


        window.__dashboardDetailsFixed =
            true;


        return true;

    }


    /* ========================================================
       2. MATERIAL GROUPING
    ======================================================== */

    function installMaterialGrouping(){

        if(
            typeof window.showDashboardDetailsModal !==
            "function"
        ){

            return false;

        }


        if(
            window.__dashboardMaterialGroupingFixed
        ){

            return true;

        }


        const originalShowDashboardDetailsModal =
            window.showDashboardDetailsModal;


        window.showDashboardDetailsModal =
            function(
                items,
                materials,
                materialSummary = {},
                production = null,
                formula = {}
            ){

                originalShowDashboardDetailsModal(
                    items,
                    materials,
                    materialSummary,
                    production,
                    formula
                );


                requestAnimationFrame(
                    function(){

                        buildMaterialSummary(
                            materials
                        );

                    }
                );

            };


        window.__dashboardMaterialGroupingFixed =
            true;


        return true;

    }


    /* ========================================================
       3. BUILD MATERIAL SUMMARY
    ======================================================== */

    function buildMaterialSummary(
        materials
    ){

        const modal =
            document.querySelector(
                "#dashboardDetailsModal"
            );


        if(!modal){

            return;

        }


        const table =
            modal.querySelector(
                ".dashboard-material-table"
            );


        if(!table){

            return;

        }


        if(
            modal.querySelector(
                ".dashboard-material-drilldown"
            )
        ){

            return;

        }


        const rows =
            Array.isArray(materials)
                ? materials
                : [];


        const sufficient =
            rows.filter(
                item =>
                    item?.sufficient === true ||
                    item?.sufficient === 1 ||
                    item?.sufficient === "1"
            );


        const shortage =
            rows.filter(
                item =>
                    !(
                        item?.sufficient === true ||
                        item?.sufficient === 1 ||
                        item?.sufficient === "1"
                    )
            );


        const requiredTotal =
            rows.reduce(
                (
                    sum,
                    item
                ) =>
                    sum +
                    Number(
                        item?.required_quantity || 0
                    ),
                0
            );


        const availableTotal =
            rows.reduce(
                (
                    sum,
                    item
                ) =>
                    sum +
                    Number(
                        item?.available_quantity || 0
                    ),
                0
            );


        const shortageTotal =
            rows.reduce(
                (
                    sum,
                    item
                ) =>
                    sum +
                    Number(
                        item?.shortage_quantity || 0
                    ),
                0
            );


        const section =
            table.closest(
                "section"
            );


        if(!section){

            return;

        }


        section.classList.add(
            "dashboard-material-drilldown"
        );


        const tableWrapper =
            table.closest(
                ".table-wrapper"
            );


        if(!tableWrapper){

            return;

        }


        /*
         * جدول اصلی را نگه می‌داریم
         * اما در حالت عادی مخفی است.
         */

        tableWrapper.classList.add(
            "dashboard-material-detail-wrap"
        );


        tableWrapper.hidden =
            true;


        const summary =
            document.createElement(
                "div"
            );


        summary.className =
            "dashboard-material-drilldown-ui";


        summary.innerHTML = `

            <div class="
                dashboard-material-groups
            ">


                <!-- کافی -->

                <div class="
                    dashboard-material-group
                    dashboard-material-group-success
                ">

                    <div>

                        <div class="
                            dashboard-material-group-title
                        ">
                            مواد کافی
                        </div>


                        <div class="
                            dashboard-material-group-value
                        ">
                            ${sufficient.length}
                            قلم
                        </div>


                        <div class="
                            dashboard-material-group-meta
                        ">
                            موجودی کافی برای مصرف برنامه
                        </div>

                    </div>


                    <div class="
                        dashboard-material-group-icon
                    ">
                        ✓
                    </div>

                </div>


                <!-- کسری -->

                <div class="
                    dashboard-material-group
                    dashboard-material-group-danger
                ">

                    <div>

                        <div class="
                            dashboard-material-group-title
                        ">
                            مواد دارای کسری
                        </div>


                        <div class="
                            dashboard-material-group-value
                        ">
                            ${shortage.length}
                            قلم
                        </div>


                        <div class="
                            dashboard-material-group-meta
                        ">
                            مجموع کسری:
                            ${shortageTotal}
                        </div>

                    </div>


                    <div class="
                        dashboard-material-group-icon
                    ">
                        ⚠
                    </div>

                </div>


            </div>


            <!-- جمع کل -->

            <div class="
                dashboard-material-group
                dashboard-material-group-total
            ">

                <div>

                    <div class="
                        dashboard-material-group-title
                    ">
                        جمع مواد موردنیاز
                    </div>


                    <div class="
                        dashboard-material-group-value
                    ">
                        ${requiredTotal}
                    </div>


                    <div class="
                        dashboard-material-group-meta
                    ">
                        موجودی تجمیعی:
                        ${availableTotal}
                    </div>

                </div>


                <div class="
                    dashboard-material-group-icon
                ">
                    ∑
                </div>

            </div>


            <!-- فهرست کامل -->

            <button
                type="button"
                class="
                    dashboard-material-detail-toggle
                "
                aria-expanded="false"
            >

                <span>
                    مشاهده فهرست کامل
                    ${rows.length}
                    قلم
                </span>


                <span>
                    ‹
                </span>

            </button>

        `;


        const toggle =
            summary.querySelector(
                ".dashboard-material-detail-toggle"
            );


        toggle.addEventListener(
            "click",
            function(){

                const isOpen =
                    !tableWrapper.hidden;


                tableWrapper.hidden =
                    isOpen;


                tableWrapper.classList.toggle(
                    "is-open",
                    !isOpen
                );


                toggle.setAttribute(
                    "aria-expanded",
                    String(!isOpen)
                );


                const text =
                    toggle.querySelector(
                        "span:first-child"
                    );


                if(text){

                    text.textContent =
                        isOpen
                            ? `مشاهده فهرست کامل ${rows.length} قلم`
                            : "بستن فهرست کامل";

                }

            }
        );


        /*
         * بخش قبلی تحلیل مواد را پاک نمی‌کنیم.
         * فقط محتوای جدول را تبدیل می‌کنیم.
         */

        const label =
            section.querySelector(
                ".dashboard-section-label"
            );


        section.innerHTML = "";


        if(label){

            label.textContent =
                "تحلیل تجمیعی مواد";


            section.appendChild(
                label
            );

        }


        section.appendChild(
            summary
        );


        summary.appendChild(
            tableWrapper
        );

    }


    /* ========================================================
       4. DASHBOARD CSS
    ======================================================== */

    function installDashboardCSS(){

        if(
            document.getElementById(
                "dashboard-fixes-css"
            )
        ){

            return;

        }


        const style =
            document.createElement(
                "style"
            );


        style.id =
            "dashboard-fixes-css";


        style.textContent = `

/* ============================================================
   DASHBOARD THEME
============================================================ */

.dashboard-page{

    --dashboard-bg:
        var(--surface,#ffffff);

    --dashboard-bg-soft:
        var(--surface-2,#f8fafc);

    --dashboard-text:
        var(--text,#172033);

    --dashboard-muted:
        var(--muted,#64748b);

    --dashboard-border:
        var(--border,#e2e8f0);

    --dashboard-primary:
        var(--primary,#2563eb);

    --dashboard-success:
        var(--success,#16a34a);

    --dashboard-warning:
        var(--warning,#d97706);

    --dashboard-danger:
        var(--danger,#dc2626);

}


/* ============================================================
   DARK THEME
============================================================ */

:root[data-theme="dark"]{

    --dashboard-bg:
        #172033;

    --dashboard-bg-soft:
        #111827;

    --dashboard-text:
        #f8fafc;

    --dashboard-muted:
        #94a3b8;

    --dashboard-border:
        #334155;

    --dashboard-primary:
        #60a5fa;

    --dashboard-success:
        #4ade80;

    --dashboard-warning:
        #fbbf24;

    --dashboard-danger:
        #f87171;

}


/* ============================================================
   DASHBOARD BASE
============================================================ */

.dashboard-page{

    color:
        var(--dashboard-text);

}


.dashboard-hero,
.dashboard-kpi,
.dashboard-status-card,
.dashboard-plan-row,
.dashboard-action-card{

    background:
        var(--dashboard-bg);

    color:
        var(--dashboard-text);

    border-color:
        var(--dashboard-border);

}


.dashboard-subtitle,
.dashboard-status-message,
.dashboard-kpi-label,
.dashboard-kpi-meta,
.dashboard-plan-info small,
.dashboard-plan-metric span,
.dashboard-plan-progress span,
.dashboard-footer,
.dashboard-section-kicker,
.dashboard-modal-kicker{

    color:
        var(--dashboard-muted);

}


/* ============================================================
   MODAL LIST
============================================================ */

.dashboard-modal-overlay{

    position:fixed !important;

    inset:0 !important;

    z-index:99999 !important;

    padding:20px !important;

}


.dashboard-modal-backdrop{

    background:
        rgba(2,6,23,.72) !important;

    backdrop-filter:
        blur(9px);

}


.dashboard-modal-container{

    background:
        var(--dashboard-bg) !important;

    color:
        var(--dashboard-text) !important;

    border:
        1px solid
        var(--dashboard-border);

}


/* ============================================================
   DETAIL MODAL
============================================================ */

#dashboardDetailsModal{

    position:fixed !important;

    inset:0 !important;

    z-index:100001 !important;

    display:flex !important;

    align-items:center !important;

    justify-content:center !important;

    padding:20px !important;

    background:
        rgba(2,6,23,.72) !important;

    backdrop-filter:
        blur(9px);

}


#dashboardDetailsModal
.dashboard-detail-modal{

    width:
        min(1120px,100%) !important;

    max-height:
        92vh !important;

    overflow:
        hidden !important;

    margin:
        0 !important;

    border:
        1px solid
        var(--dashboard-border) !important;

    border-radius:
        24px !important;

    background:
        var(--dashboard-bg) !important;

    color:
        var(--dashboard-text) !important;

    box-shadow:
        0 30px 90px rgba(0,0,0,.38) !important;

}


#dashboardDetailsModal
.modal-header{

    background:
        var(--dashboard-bg) !important;

    color:
        var(--dashboard-text) !important;

    border-bottom:
        1px solid
        var(--dashboard-border) !important;

}


#dashboardDetailsModal
.modal-body{

    background:
        var(--dashboard-bg) !important;

    color:
        var(--dashboard-text) !important;

    max-height:
        calc(92vh - 80px);

    overflow:
        auto;

}


/* ============================================================
   DETAIL KPI
============================================================ */

.dashboard-drill-kpi{

    background:
        var(--dashboard-bg-soft);

    border:
        1px solid
        var(--dashboard-border);

    color:
        var(--dashboard-text);

}


.dashboard-drill-kpi span{

    color:
        var(--dashboard-muted);

}


.dashboard-drill-kpi strong{

    color:
        var(--dashboard-text);

}


/* ============================================================
   FORMULA
============================================================ */

.dashboard-formula-card{

    background:
        var(--dashboard-bg-soft);

    border:
        1px solid
        var(--dashboard-border);

    color:
        var(--dashboard-text);

}


.dashboard-formula{

    background:
        color-mix(
            in srgb,
            var(--dashboard-primary) 10%,
            var(--dashboard-bg)
        ) !important;

    color:
        var(--dashboard-text) !important;

    border:
        1px solid
        color-mix(
            in srgb,
            var(--dashboard-primary) 25%,
            var(--dashboard-border)
        );

}


/* ============================================================
   MATERIAL SUMMARY
============================================================ */

.dashboard-material-summary{

    background:
        var(--dashboard-bg);

    border:
        1px solid
        var(--dashboard-border);

    color:
        var(--dashboard-text);

}


.dashboard-material-summary h3{

    color:
        var(--dashboard-text);

}


.dashboard-material-summary-head{

    color:
        var(--dashboard-text);

}


/* ============================================================
   MATERIAL GROUPS
============================================================ */

.dashboard-material-groups{

    display:grid;

    grid-template-columns:
        repeat(2,minmax(0,1fr));

    gap:12px;

    margin:
        14px 0;

}


.dashboard-material-group{

    display:flex;

    align-items:center;

    justify-content:space-between;

    gap:12px;

    padding:16px;

    border:
        1px solid
        var(--dashboard-border);

    border-radius:16px;

    background:
        var(--dashboard-bg-soft);

    color:
        var(--dashboard-text);

}


.dashboard-material-group-title{

    color:
        var(--dashboard-muted);

    font-size:11px;

}


.dashboard-material-group-value{

    margin-top:4px;

    color:
        var(--dashboard-text);

    font-size:21px;

    font-weight:900;

}


.dashboard-material-group-meta{

    margin-top:4px;

    color:
        var(--dashboard-muted);

    font-size:10px;

}


.dashboard-material-group-icon{

    width:40px;

    height:40px;

    flex:none;

    display:grid;

    place-items:center;

    border-radius:13px;

    font-weight:900;

}


.dashboard-material-group-success
.dashboard-material-group-icon{

    color:
        var(--dashboard-success);

    background:
        rgba(74,222,128,.12);

}


.dashboard-material-group-danger
.dashboard-material-group-icon{

    color:
        var(--dashboard-danger);

    background:
        rgba(248,113,113,.12);

}


.dashboard-material-group-total{

    margin-bottom:12px;

}


.dashboard-material-detail-toggle{

    width:100%;

    display:flex;

    align-items:center;

    justify-content:space-between;

    gap:12px;

    padding:13px 15px;

    margin-top:10px;

    border:
        1px solid
        var(--dashboard-border);

    border-radius:14px;

    background:
        var(--dashboard-bg-soft);

    color:
        var(--dashboard-text);

    font-weight:800;

    text-align:right;

}


.dashboard-material-detail-wrap{

    display:block;

    margin-top:10px;

    border:
        1px solid
        var(--dashboard-border);

    border-radius:15px;

    overflow:auto;

}


.dashboard-material-detail-wrap[hidden]{

    display:none !important;

}


.dashboard-material-detail-wrap
.data-table{

    min-width:720px;

}


.dashboard-material-detail-wrap
.data-table th{

    position:sticky;

    top:0;

    z-index:2;

    background:
        var(--dashboard-bg-soft) !important;

    color:
        var(--dashboard-muted) !important;

}


.dashboard-material-detail-wrap
.data-table td{

    background:
        var(--dashboard-bg) !important;

    color:
        var(--dashboard-text) !important;

    border-bottom-color:
        var(--dashboard-border) !important;

}


/* ============================================================
   MOBILE
============================================================ */

@media(max-width:760px){

    .dashboard-material-groups{

        grid-template-columns:1fr;

    }


    #dashboardDetailsModal{

        padding:8px !important;

    }


    #dashboardDetailsModal
    .dashboard-detail-modal{

        max-height:96vh !important;

        border-radius:20px !important;

    }


    #dashboardDetailsModal
    .modal-body{

        max-height:
            calc(96vh - 76px);

        padding:
            14px !important;

    }

}

`;


        document.head.appendChild(
            style
        );

    }


    /* ========================================================
       INSTALL
    ======================================================== */

    function install(){

        installDashboardCSS();

        installDashboardDetailsFix();

        installMaterialGrouping();

    }


    /*
     * چون این فایل بعد از index.html لود می‌شود،
     * معمولاً توابع همین الان موجود هستند.
     * چند بار retry برای اطمینان.
     */

    let attempts = 0;


    function boot(){

        attempts++;


        install();


        if(
            attempts < 40 &&
            (
                typeof window.loadDashboardDetails !==
                "function" ||
                typeof window.showDashboardDetailsModal !==
                "function"
            )
        ){

            setTimeout(
                boot,
                50
            );

        }

    }


    boot();

})();
