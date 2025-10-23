$(function () {

    // ---------------------------------------------- //
    // Navbar
    // ---------------------------------------------- //

    $(document).scroll(function () {
        if ($(window).scrollTop() >= $('header').offset().top) {
            $('nav').addClass('sticky');
        } else {
            $('nav').removeClass('sticky');
        }
    });


    // ---------------------------------------------- //
    // Scroll Spy
    // ---------------------------------------------- //

    $('body').scrollspy({
        target: '.navbar',
        offset: 100
    });

    // ---------------------------------------------- //
    // Preventing URL update on navigation link click
    // ---------------------------------------------- //

    $('.navbar-nav a, #scroll-down').bind('click', function (e) {
        var anchor = $(this);
        var href = anchor.attr('href');
        var target = $(href);

        if (target.length) {
            var navHeight = $('nav').outerHeight() || 80;
            var offset = 20;

            var scrollPosition = target.offset().top - navHeight - offset;

            // For contact section, ensure we scroll to the maximum to show it fully
            if (href === '#contact') {
                var maxScroll = $(document).height() - $(window).height();
                scrollPosition = maxScroll;
            }

            $('html, body').stop().animate({
                scrollTop: scrollPosition
            }, 1000);
            e.preventDefault();
        }
    });

    // ------------------------------------------------------ //
    // styled Google Map
    // ------------------------------------------------------ //

    map();

});


// ------------------------------------------------------ //
// Toggle academic project details
// ------------------------------------------------------ //

function toggleProject(card) {
    var details = card.querySelector('.project-details');
    var icon = card.querySelector('.expand-icon i');

    if (details.classList.contains('active')) {
        details.classList.remove('active');
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-right');
    } else {
        details.classList.add('active');
        icon.classList.remove('fa-chevron-right');
        icon.classList.add('fa-chevron-down');
    }
}

// ------------------------------------------------------ //
// styled Google Map
// ------------------------------------------------------ //

function map() {

    var mapId = 'map',
        mapCenter = [-27.4698, 153.0251],
        markerPosition = [-27.4640, 153.0251],
        mapMarker = true;

    if ($('#' + mapId).length > 0) {

        var icon = L.icon({
            iconUrl: 'img/marker.png',
            iconSize: [25, 37.5],
            popupAnchor: [0, -18],
            tooltipAnchor: [0, 19]
        });

        var dragging = false,
            tap = false;

        if ($(window).width() > 700) {
            dragging = true;
            tap = true;
        }

        var map = L.map(mapId, {
            center: mapCenter,
            zoom: 13,
            dragging: dragging,
            tap: tap,
            scrollWheelZoom: false
        });

        var tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20
        });

        tileLayer.addTo(map);

        map.once('focus', function () {
            map.scrollWheelZoom.enable();
        });

        if (mapMarker) {
            var marker = L.marker(markerPosition, {
                icon: icon
            }).addTo(map);

            marker.bindPopup("<div class='p-4'><h5>Info Window Content</h5><p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.</p></div>", {
                minwidth: 200,
                maxWidth: 600,
                className: 'map-custom-popup'
            })

        }
    }

}