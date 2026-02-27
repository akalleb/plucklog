
// Nested sortable demo
// var nestedSortables = [].slice.call(document.querySelectorAll('.nested-sortable'));

// Loop through each nested sortable element
// if (nestedSortables)
//     Array.from(nestedSortables).forEach(function (nestedSort) {
//         new Sortable(nestedSort, {
//             group: 'nested',
//             animation: 150,
//             fallbackOnBody: true,
//             swapThreshold: 0.65
//         });
//     });

// // Nested sortable handle demo
// var nestedSortablesHandles = [].slice.call(document.querySelectorAll('.nested-sortable-handle'));
// if (nestedSortablesHandles)
//     // Loop through each nested sortable element
//     Array.from(nestedSortablesHandles).forEach(function (nestedSortHandle) {
//         new Sortable(nestedSortHandle, {
//             handle: '.handle',
//             group: 'nested',
//             animation: 150,
//             fallbackOnBody: true,
//             swapThreshold: 0.65
//         });
//     });


"use strict";
$(function () {
    new Sortable(document.getElementById("sortable-1")),
        new Sortable(document.getElementById("sortable-2"), {
            handle: ".sortable-handle"
        }),
        new Sortable(document.getElementById("sortable-3-start"), {
            group: "shared"
        }),
        new Sortable(document.getElementById("sortable-3-end"), {
            group: "shared"
        }),
        new Sortable(document.getElementById("sortable-4-start"), {
            group: { name: "shared", pull: "clone" }
        }),
        new Sortable(document.getElementById("sortable-4-end"), {
            group: { name: "shared", pull: "clone" }
        }),
        new Sortable(document.getElementById("sortable-5-start"), {
            group: { name: "shared", pull: "clone", put: !1 },
            sort: !1
        }), new Sortable(document.getElementById("sortable-5-end"), {
            group: "shared"
        }),
        new Sortable(document.getElementById("sortable-6"), {
            group: "shared", invertSwap: !0
        }),
        $("#sortable-6").find(".sortable").each(function () {
            new Sortable(this, {
                group: "shared", invertSwap: !0
            })
        })
});