(function() {
    function reload() {
        location.reload();
    }
    var r = new XMLHttpRequest();
    r.open("GET", "/autoreloademitter", true);
    r.onreadystatechange = function() {
        if (r.readyState != 4 || r.status != 200) {
            setTimeout(reload, 1000);
        } else {
            reload();
        }
    };
    r.send(null);
})();