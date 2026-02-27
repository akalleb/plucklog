
$(document).ready(function () {

    // Column rendering
    $('#datatable-col-render').DataTable({
        columnDefs: [
            {
                render: function (data, type, row) {
                    return data + ' (' + row[3] + ')';
                },
                targets: 0,
            },
            { visible: false, targets: [3] },
        ],
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



    // Column Visibility
    $('#datatable-col-visiblility').DataTable({
        dom: 'Bfrtip',
        buttons: [
            'colvis'
        ],
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




    
    // footer-callback
    $('#datatable-footer-callback').DataTable({
        footerCallback: function (row, data, start, end, display) {
            var api = this.api();

            // Remove the formatting to get integer data for summation
            var intVal = function (i) {
                return typeof i === 'string' ? i.replace(/[\$,]/g, '') * 1 : typeof i === 'number' ? i : 0;
            };

            // Total over all pages
            total = api
                .column(4)
                .data()
                .reduce(function (a, b) {
                    return intVal(a) + intVal(b);
                }, 0);

            // Total over this page
            pageTotal = api
                .column(4, { page: 'current' })
                .data()
                .reduce(function (a, b) {
                    return intVal(a) + intVal(b);
                }, 0);

            // Update footer
            $(api.column(4).footer()).html('$' + pageTotal + ' ( $' + total + ' total)');
        },
        buttons: [
            'colvis'
        ],
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


    // multi control
    $('#datatable-multi-control').DataTable({
        dom: '<"top"lp<"clear">>rt<"bottom"iflp<"clear">>',
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


        // row-callback
        $('#datatable-row-callback').DataTable({
            createdRow: function (row, data, index) {
                console.log(data[5])
                if (data[5].replace(/[\$,]/g, '') * 1 > 150000) {
                    $('td', row).eq(5).addClass('fw-bold text-primary');
                }
            },
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