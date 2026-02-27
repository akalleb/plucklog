
$(document).ready(function () {

    // datatable-autofill
    $('#datatable-autofill').DataTable({
        autoFill: true,
        "language": {
            "paginate": {
                "previous": "<i class='mdi mdi-chevron-left'>",
                "next": "<i class='mdi mdi-chevron-right'>"
            }
        },
        "drawCallback": function () {
            $('.dataTables_paginate > .pagination').addClass('pagination');
        }
    });


    $(".dataTables_length select").addClass('form-select form-select-sm');


    // datatable-buttons
    if(document.getElementById("datatable-buttons")){
        var buttonsDatatable = $('#datatable-buttons').DataTable( {
            lengthChange: false,
            buttons: [ 'copy', 'excel', 'pdf', 'colvis' ],
            "language": {
                "paginate": {
                    "previous": "<i class='mdi mdi-chevron-left'>",
                    "next": "<i class='mdi mdi-chevron-right'>"
                }
            },
            "drawCallback": function () {
                $('.dataTables_paginate > .pagination').addClass('pagination');
            }
        } );
     
        buttonsDatatable.buttons().container()
            .appendTo( '#datatable-buttons_wrapper .col-md-6:eq(0)' );
    }


    // datatable-colReorder
    $('#datatable-colReorder').DataTable({
        colReorder: true,
        "language": {
            "paginate": {
                "previous": "<i class='mdi mdi-chevron-left'>",
                "next": "<i class='mdi mdi-chevron-right'>"
            }
        },
        "drawCallback": function () {
            $('.dataTables_paginate > .pagination').addClass('pagination');
        }
    });


    // datatable - fixedHeader
    $('#datatable-fixedheader').DataTable({
        fixedHeader: true,
        "language": {
            "paginate": {
                "previous": "<i class='mdi mdi-chevron-left'>",
                "next": "<i class='mdi mdi-chevron-right'>"
            }
        },
        "drawCallback": function () {
            $('.dataTables_paginate > .pagination').addClass('pagination');
        }
    });


    // datatable - fixedcolumn
    $('#datatable-fixedcolumn').DataTable({
        scrollY:        "300px",
        scrollX:        true,
        scrollCollapse: true,
        paging:         false,
        fixedColumns:   true,
        "language": {
            "paginate": {
                "previous": "<i class='mdi mdi-chevron-left'>",
                "next": "<i class='mdi mdi-chevron-right'>"
            }
        },
        "drawCallback": function () {
            $('.dataTables_paginate > .pagination').addClass('pagination');
        }
    });


     // datatable - keytable
     $('#datatable-keytable').DataTable({
        keys: true,
        "language": {
            "paginate": {
                "previous": "<i class='mdi mdi-chevron-left'>",
                "next": "<i class='mdi mdi-chevron-right'>"
            }
        },
        "drawCallback": function () {
            $('.dataTables_paginate > .pagination').addClass('pagination');
        }
    });

    // datatable - row-group
    $('#datatable-row-group').DataTable({
        order: [[2, 'asc']],
        rowGroup: {
            dataSrc: 2
        },
        "drawCallback": function () {
            $('.dataTables_paginate > .pagination').addClass('pagination');
        }
    });



    // datatable-rowReorder
    $('#datatable-rowReorder').DataTable({
        rowReorder  : true,
        "language": {
            "paginate": {
                "previous": "<i class='mdi mdi-chevron-left'>",
                "next": "<i class='mdi mdi-chevron-right'>"
            }
        },
        "drawCallback": function () {
            $('.dataTables_paginate > .pagination').addClass('pagination');
        }
    });


    // datatable - keytable
    $('#datatable-keytable').DataTable({
        keys: true,
        "language": {
            "paginate": {
                "previous": "<i class='mdi mdi-chevron-left'>",
                "next": "<i class='mdi mdi-chevron-right'>"
            }
        },
        "drawCallback": function () {
            $('.dataTables_paginate > .pagination').addClass('pagination');
        }
    });


    // datatable - scrollable
    $('#datatable-scrollable').DataTable({
        deferRender:    true,
        scrollY:        200,
        scrollCollapse: true,
        scroller:       true,
        "language": {
            "paginate": {
                "previous": "<i class='mdi mdi-chevron-left'>",
                "next": "<i class='mdi mdi-chevron-right'>"
            }
        },
        "drawCallback": function () {
            $('.dataTables_paginate > .pagination').addClass('pagination');
        }
    });


    // datatable - searchpanes

    if(document.getElementById("datatable-searchpanes")){
        var searchpanesTable = $('#datatable-searchpanes').DataTable({
            searchPanes: true,
            "language": {
                "paginate": {
                    "previous": "<i class='mdi mdi-chevron-left'>",
                    "next": "<i class='mdi mdi-chevron-right'>"
                }
            },
            "drawCallback": function () {
                $('.dataTables_paginate > .pagination').addClass('pagination');
            }
            
        });

        searchpanesTable.searchPanes.container().prependTo(searchpanesTable.table().container());
        searchpanesTable.searchPanes.resizePanes();
    }


    // datatable - select
    $('#datatable-select').DataTable({
        select: true,
        "language": {
            "paginate": {
                "previous": "<i class='mdi mdi-chevron-left'>",
                "next": "<i class='mdi mdi-chevron-right'>"
            }
        },
        "drawCallback": function () {
            $('.dataTables_paginate > .pagination').addClass('pagination');
        }
    });
});