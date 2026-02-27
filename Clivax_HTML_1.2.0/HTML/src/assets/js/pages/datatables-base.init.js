
$(document).ready(function () {
    $('#datatable').DataTable({
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


    // Scroll sidebar Datatable
    $('#scroll-sidebar-datatable').DataTable({
        "scrollY": "350px",
        "scrollCollapse": true,
        "paging":         true,
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

    // Alternative Pagination Datatable
    $('#alternative-page-datatable').DataTable({
        "pagingType": "full_numbers",
        "drawCallback": function () {
            $('.dataTables_paginate > .pagination').addClass('pagination');
            $(".dataTables_length select").addClass('form-select form-select-sm');

        }
    });

    $("#datatable-1").DataTable({
        responsive: !0,
        lengthMenu: [[5, 10, 25, 50, -1], [5, 10, 25, 50, "All"]]
    })

    $(".dataTables_length select").addClass('form-select form-select-sm');
});