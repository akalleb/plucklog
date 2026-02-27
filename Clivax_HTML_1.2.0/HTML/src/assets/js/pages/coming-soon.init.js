

$('[data-countdown]').each(function () {
    var $this = $(this), finalDate = $(this).data('countdown');
    $this.countdown(finalDate, function (event) {
        $(this).html(event.strftime(''
        + '<div class="coming-box col-6 col-sm-3 mb-2 mb-sm-0">%D <span>Days</span></div> '
        + '<div class="coming-box col-6 col-sm-3 mb-2 mb-sm-0">%H <span>Hours</span></div> '
        + '<div class="coming-box col-6 col-sm-3">%M <span>Minutes</span></div> '
        + '<div class="coming-box col-6 col-sm-3">%S <span>Seconds</span></div> '));
    });
});