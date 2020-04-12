var map = null,
    progressBar = null,
    markerGroup = null,
    socket = null,
    allowMultipleAnswer = false,
    playerNameStorage = 'player_name',
    playerColor = 'blue';

$(document).ready(function () {

    // Create the progress bar
    progressBar = new ProgressBar.Line('#progress', {
        color: '#FCB03C',
        duration: $('#progress').data('max-response-time') * 1000
    });

    // Is user allowed answer multiple times to the same question
    allowMultipleAnswer = $('#game_rules').data('allow-multiple-answers');

    // Toggle top ten when user clicks on the leaderboard
    $('#leaderboard').click(function () {
        $("#top_ten").slideToggle();
        $("#user_rank").slideToggle();
    });

    // Create the leaflet map
    map = createMap();

    // Create the marker group used to clear markers between turns
    markerGroup = new L.LayerGroup().addTo(map);

    // Look for a previously entered player name in local storage
    if (typeof (Storage) !== "undefined" && localStorage.getItem(playerNameStorage)) {

        // If player name found, start the game using it
        joinGame(localStorage.getItem(playerNameStorage));

    } else {

        // Else, ask for player name
        login();

    }


});

/**
 * Create the leaflet map.
 * @returns {Array|*}
 */
function createMap() {

    // How many zoom level are allowed
    var zoomLevel = $('#map').data('zoom-level');

    // Create a world map
    var map = L.map('map', {
        layers: [
            L.tileLayer(cdnUrl + '/tiles/{z}/{x}/{y}.png', {
                attribution: 'Tiles generated using <a href="https://github.com/mapbox/tilemill" target="_blank">TileMill</a>',
                noWrap: true,
                ext: 'png'
            })
        ],
        zoomControl: zoomLevel != 0,
        zoom: 2,
        maxZoom: 2 + zoomLevel,
        minZoom: 2,
        center: [49, 2.5],
        // Force the user to stay between the given bounds
        maxBounds: [
            [-70.0, -180.0],
            [85.0, 180.0]
        ]

    });

    // map.doubleClickZoom.disable();

    // Add a legend in the bottom left corner
    var legend = L.control({position: 'bottomleft'});

    legend.onAdd = function (map) {
        var div = L.DomUtil.create('div', 'info');
        div.id = 'legend';
        div.innerHTML += '<div id="legend_players"></div>';

        // div.innerHTML += '<img height="20" width="12" src="' + cdnUrl + '/images/marker-icon-blue.png' + '" alt="Your answer"/> Your answer<br>';
        div.innerHTML += '<img height="20" width="12" src="' + cdnUrl + '/images/marker-icon-red.png' + '" alt="Correct answer"/> Correct answer<br>';
        // div.innerHTML += '<img height="20" width="12" src="' + cdnUrl + '/images/marker-icon-green.png' + '" alt="Best answer"/> Closest answer<br>';
        return div;
    };

    legend.addTo(map);

    return map;

}

/**
 * Ask the player for his name and store it in local storage if possible.
 * Once the player has entered a valid name, start the game.
 */
function login() {

    $("#login_modal").modal({
        escapeClose: false,
        clickClose: false,
        showClose: false
    });

    $("#login_form").submit(function (event) {

        event.preventDefault();

        var playerName = $('#player_name').val();

        // Validate player name
        if (!playerName) {

            $("#login_error").text('Please select a player name.');

        } else if (playerName.length > 50) {

            $("#login_error").text('Player name must contain less than 50 characters.');

        } else {

            // Store player name if possible
            if (typeof (Storage) !== "undefined") {
                localStorage.setItem(playerNameStorage, playerName);
            }

            // Launch the game
            joinGame(playerName);

            $.modal.close();

        }

    });

}

/**
 * Join the game using the given player name.
 * @param playerName
 */
function joinGame(playerName) {

    // Create the web socket
    socket = io.connect('//' + document.domain + ':' + location.port);

    // Handle new turn
    socket.on('new_turn', handleNewTurn);

    // Handle leaderboard update
    socket.on('leaderboard_update', updateLeaderboard);

    // Join the default game
    socket.emit('join_game', playerName);

    // Handle color inform
    socket.on('color_inform', handleColorInform);
}

/**
 * Update the leaderboard to show top ten players and user rank.
 * @param data
 */
function updateLeaderboard(data) {

    // Update player rank
    $('#user_rank_value').html('(' + (data.player_rank + 1) + ' / ' + data.total_player + ' players)');

    // Update player global score
    $('#global_score_value').text(data.player_score);

    // Remove previous scores
    $('.score_row').remove();

    for (var i = 0; i < 10; i++) {

        if (data.player_rank == i) {

            $('#leaderboard table tr:last').after('<tr class="score_row user_score"><td>' + (i + 1) + '</td><td>You</td><td>' + data.player_score + '</td></tr>');

        } else if (data.top_ten[i]) {

            var row = $('<tr class="score_row">')
                .append($('<td>').text(i + 1))
                .append($('<td>').text(data.top_ten[i].player_name))
                .append($('<td>').text(data.top_ten[i].score))

            $('#leaderboard table tr:last').after(row);

        }

    }

    if (data.player_rank >= 10) {

        $('#leaderboard table tr:last').after('<tr class="score_row user_score"><td>' + (data.player_rank + 1) + '</td><td>You</td><td>' + data.player_score + '</td></tr>');

    }

}

/**
 * Start a new game turn.
 * Show the city to locate and listen for player answers.
 * @param data
 */
function handleNewTurn(data) {

    // Clear potential markers from previous turn
    markerGroup.clearLayers();

    // Update game rules to show the city to find
    $('#game_rules').html('Locate <span class="city">' + data.city + '</span> (' + data.country + ')');

    // Show countdown timer
    progressBar.animate(1);

    // Enable answers for this turn
    map.on('click', answer);

    // Handle end of turn
    socket.on('end_of_turn', handleEndOfTurn);

    // Handle player results
    socket.on('player_results', showPlayerResults);

    // Handle legend changes
    socket.on('legend_changes', handleLegendChanges);

    // Handle color inform
    socket.on('color_inform', handleColorInform);
}

/**
 * End current turn.
 * Show best answer and correct answer for this turn.
 * @param data
 */
function handleEndOfTurn(data) {

    // Reset zoom to default
    map.setZoom(2);

    // Disable answers listener
    map.off('click', answer);

    // Reset countdown timer
    progressBar.set(0);

    // Clear markers
    markerGroup.clearLayers();

    // var new_game_rules_html = '<ul style="text-align: left">';
    // var new_game_rules_html = '<table>';

    // Show best answer if there is one
    // if (data.best_answer) {
    //     var bestMarker = createMarker(data.best_answer.lat, data.best_answer.lng, 'green');
    //     bestMarker.bindPopup('Closest answer (<b>' + data.best_answer.name + ': ' + round(data.best_answer.distance) + ' km</b> away)').openPopup();
    //     new_game_rules_html += '<li><b>1.</b> ' + round(data.best_answer.distance) + 'km - ' + data.best_answer.name + '</li>';
    // }

    if (data.answers) {
        for (i = 0; i < data.answers.length; i++) {
            var tmp_answer = data.answers[i];
            if (tmp_answer.color) {
                var tmp_Marker = createMarker(tmp_answer.lat, tmp_answer.lng, tmp_answer.color);
            } else {  // TODO is this already handled in game_master.py? always sends a color and defaults to grey?
                var tmp_Marker = createMarker(tmp_answer.lat, tmp_answer.lng, 'grey');
            }
            if (i == 0) {
                tmp_Marker.bindPopup('Closest answer (<b>' + tmp_answer.name + ': ' + round(tmp_answer.distance) + ' km</b> away)').openPopup();
            } else {
                tmp_Marker.bindPopup(tmp_answer.name + ': <b>' + round(tmp_answer.distance) + ' km</b> away');
            }
            // new_game_rules_html += '<li><b>' + (i + 1) + '.</b> '  + round(tmp_answer.distance) + 'km - ' + tmp_answer.name + '</li>';
        }
    }

    // Show correct answer
    var correctMarker = createMarker(data.correct_answer.lat, data.correct_answer.lng, 'red');
    correctMarker.bindPopup(data.correct_answer.name);

    // Update game rules
    $('#game_rules').html('Waiting for the next turn');

    // new_game_rules_html += '</ul>'
    // if (new_game_rules_html != '<ul style="text-align: left"></ul>') {
    //     $('#game_rules').html(new_game_rules_html);
    // } else {
    //     $('#game_rules').html('Nobody answered. Waiting for the next turn');
    // }
}

/**
 * Show player results for the last turn.
 * @param data
 */
function showPlayerResults(data) {

    // Place a marker to identify user answer
    var userMarker = createMarker(data.lat, data.lng, 'blue');

    // Show user score, ranking and distance
    var resultsText = '<div class="results"><b>' + round(data.distance) + ' km</b> away: ';

    // Show user score
    if (data.score == 0) {
        resultsText += '<span class="score">Too far away!</span>';
    } else {
        resultsText += '<span class="score">+<span id="score_value">0</span> points</span>';
    }

    resultsText += '<br/>You are <b>#' + data.rank + '</b> out of <b>' + data.total + '</b> player(s) for this turn</div>';

    // userMarker.bindPopup(resultsText).openPopup();
    userMarker.bindPopup(resultsText);

    if (data.score != 0) {
        // Animate player score
        animateValue('score_value', data.score);
    }

}

/**
 * Display player_name next to colored icon in legend.
 * @param data
 */
function handleLegendChanges(data) {
    var new_html = ""
    for (i = 0; i < data.length; i++) {
        var tmp_player_name = data[i][0];
        var tmp_color = data[i][1];
        var tmp_player_result = round(data[i][2]);
        new_html += '<img height="20" width="12" src="' + cdnUrl + '/images/marker-icon-' + tmp_color + '.png' + '" ' +
            'alt="Player' + (i + 1) + '"/> <span id="legend_player_' + (i + 1) + '">' + tmp_player_name + ' - ' +
            tmp_player_result + 'km</span><br>';
    }

    $('#legend_players').html(new_html);
}

/**
 * Receive color for the player to use in answer(e).
 * @param data
 */
function handleColorInform(data) {
    console.log('COLORINFORM');
    console.log(data);
    playerColor = data;
}

/**
 * Send user answer to the server.
 * @param e
 */
function answer(e) {

    // Clear previous markers if user is allowed to give multiple answers
    if (allowMultipleAnswer) {
        markerGroup.clearLayers();
    }
    // If user is not allowed to give multiple answer, turn off the answer listener
    else {
        map.off('click', answer);
    }

    // Mark the answer on the map
    createMarker(e.latlng.lat, e.latlng.lng, playerColor);

    // Emit answer event
    socket.emit('answer', e.latlng.lat, e.latlng.lng);

}

/**
 * Create a marker on the leaflet map.
 * @param lat
 * @param lng
 * @param color
 * @returns {*}
 */
function createMarker(lat, lng, color) {

    var icon = new L.Icon({
        iconUrl: cdnUrl + '/images/marker-icon-' + color + '.png',
        shadowUrl: cdnUrl + '/images/marker-shadow.png',
        iconAnchor: [12, 41],
        popupAnchor: [1, -34]
    });

    var marker = L.marker([lat, lng], {icon: icon}).addTo(map);

    markerGroup.addLayer(marker);

    return marker;

}

/**
 * Round a float value to 2 decimal
 * @param value
 * @returns {number}
 */
function round(value) {
    return Math.round(value * 100) / 100
}

/**
 * Animate a value
 * @param elementID
 * @param newValue
 */
function animateValue(elementID, newValue) {
    var duration = 1000;
    // no timer shorter than 50ms (not really visible any way)
    var minTimer = 50;
    // calc step time to show all intermediate values
    var stepTime = Math.abs(Math.floor(duration / newValue));

    // never go below minTimer
    stepTime = Math.max(stepTime, minTimer);

    // get current time and calculate desired end time
    var startTime = new Date().getTime();
    var endTime = startTime + duration;
    var timer;

    function run() {
        var now = new Date().getTime();
        var remaining = Math.max((endTime - now) / duration, 0);
        var value = Math.round(newValue - (remaining * newValue));
        $('#' + elementID).text(value);
        if (value == newValue) {
            clearInterval(timer);
        }
    }

    timer = setInterval(run, stepTime);
    run();
}
