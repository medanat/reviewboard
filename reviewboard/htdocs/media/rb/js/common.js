function getGoogleGearsAllowed() {
    if (!google.gears.factory.hasPermission) {
        var siteName = "Review Board";
        var icon = MEDIA_URL + "rb/images/logo.png?" + MEDIA_SERIAL;
        var msg = "Review Board would like to use Google Gears to " +
                  "provide enhanced capabilities, including offline " +
                  "support.";

        if (!google.gears.factory.getPermission(siteName, icon, msg)) {
            return false;
        }
    }

    return true;
}


/*
 * Creates a form dialog based on serialized form field data.
 * This will handle creating and managing a form dialog and posting the
 * resulting data to the server.
 *
 * options has the following fields:
 *
 *    action          - The action. Defaults to "."
 *    confirmLabel    - The label on the confirm button.
 *    fields          - The serialized field data.
 *    dataStoreObject - The object to edit or create.
 *    success         - The success function. By default, this reloads the page.
 *    title           - The form title.
 *    upload          - true if this is an upload form.
 *    width           - The optional set width of the form.
 *
 * options.fields is a dictionary with the following fields:
 *
 *    name      - The name of the field.
 *    hidden    - true if this is a hidden field.
 *    label     - The label tag for the field.
 *    required  - true if this field is required.
 *    help_text - Optional help text.
 *    widget    - The HTML for the field.
 *
 * @param {object} options  The options for the dialog.
 *
 * @return {jQuery} The form dialog.
 */
$.fn.formDlg = function(options) {
    options = $.extend({
        action: ".",
        confirmLabel: "Send",
        fields: {},
        dataStoreObject: null,
        success: function() { window.location.reload(); },
        title: "",
        upload: false,
        width: null
    }, options);

    return this.each(function() {
        var self = $(this);

        var errors = $("<div/>")
            .addClass("error")
            .hide();

        var form = $("<form/>")
            .attr("action", options.action)
            .submit(function(e) {
                send();
                return false;
            })
            .append($("<table/>")
                .append($("<colgroup/>")
                    .append('<col/>')
                    .append('<col/>')
                    .append('<col width="100%"/>'))
                .append($("<tbody/>")));

        if (options.upload) {
            form.attr({
                encoding: "multipart/form-data",
                enctype:  "multipart/form-data"
            });
        }

        var tbody = $("tbody", form);

        var fieldInfo = {};

        for (var i = 0; i < options.fields.length; i++) {
            var field = options.fields[i];
            fieldInfo[field.name] = {'field': field};

            if (field.hidden) {
                form.append($(field.widget));
            } else {
                fieldInfo[field.name].row =
                    $("<tr/>")
                        .appendTo(tbody)
                        .append($("<td/>")
                            .addClass("label")
                            .html(field.label))
                        .append($("<td/>")
                            .html(field.widget))
                        .append($("<td/>")
                            .append($("<ul/>")
                                .addClass("errorlist")
                                .hide()));

                if (field.required) {
                    $("label", fieldInfo[field.name].row)
                        .addClass("required");
                }

                if (field.help_text) {
                    $("<tr/>")
                        .appendTo(tbody)
                        .append("<td/>")
                        .append($("<td/>")
                            .addClass("help")
                            .attr("colspan", 2)
                            .text(field.help_text));
                }
            }
        }

        var box = $("<div/>")
            .addClass("formdlg")
            .append(errors)
            .append(self)
            .append(form)
            .keypress(function(e) {
                e.stopPropagation();
            });

        if (options.width) {
            box.width(options.width);
        }

        box.modalBox({
            title: options.title,
            buttons: [
                $('<input type="button"/>')
                    .val("Cancel"),
                $('<input type="button"/>')
                    .val(options.confirmLabel)
                    .click(function() {
                        form.submit();
                        return false;
                    })
            ]
        });

        /*
         * Sends the form data to the server.
         */
        function send() {
            options.dataStoreObject.setForm(form);
            options.dataStoreObject.save({
                buttons: $("input:button", self.modalBox("buttons")),
                success: function(rsp) {
                    options.success(rsp);
                    box.remove();
                },
                error: function(rsp) { // error
                    displayErrors(rsp);
                }
            });
        }


        /*
         * Displays errors on the form.
         *
         * @param {object} rsp  The server response.
         */
        function displayErrors(rsp) {
            if (rsp.fields) {
                errors
                    .html(rsp.err.msg)
                    .show();

                for (var fieldName in rsp.fields) {
                    if (!fieldInfo[fieldName]) {
                        continue;
                    }

                    var list = $(".errorlist", fieldInfo[fieldName].row)
                        .css("display", "block");

                    for (var i = 0; i < rsp.fields[fieldName].length; i++) {
                        $("<li/>")
                            .appendTo(list)
                            .html(rsp.fields[fieldName][i]);
                    }
                }
            }
        }
    });
};


/*
 * Toggles whether an object is starred. Right now, we support
 * "reviewrequests" and "groups" types.
 *
 * @param {string} type      The type used for constructing the path.
 * @param {string} objid     The object ID to star/unstar.
 * @param {bool}   default_  The default value.
 */
$.fn.toggleStar = function(type, objid, default_) {
    return this.each(function() {
        var self = $(this);

        // Constants
        var STAR_ON_IMG = MEDIA_URL + "rb/images/star_on.png?" + MEDIA_SERIAL;
        var STAR_OFF_IMG = MEDIA_URL + "rb/images/star_off.png?" + MEDIA_SERIAL;

        var obj;
        var on = default_;

        self.click(function() {
            on = !on;

            if (!obj) {
                if (type == "reviewrequests") {
                    obj = new RB.ReviewRequest(objid);
                } else if (type == "groups") {
                    obj = new RB.ReviewGroup(objid);
                } else {
                    self.remove();
                    return;
                }
            }

            obj.setStarred(on);
            self.attr("src", (on ? STAR_ON_IMG : STAR_OFF_IMG));
        });
    });
};


$.fn.syncIndicator = function() {
    var self = $(this);

    var stateIcon = $("<img/>")
        .attr({
            id: "offline-sync-indicator",
            width: 11,
            height: 11
        })
        .click(function() {
            var state = RB.Offline.state;

            if (state == RB.Offline.STATE_ONLINE) {
                RB.Offline.goOffline();
            }
            else {
                RB.Offline.goOnline();
            }
        })
        .appendTo(self);

    var statusBox = $("<div/>")
        .attr("id", "offline-sync-statusbox")
        .hide()
        .appendTo(document.body);

    var statusLabel = $("<p/>")
        .text("XXX")
        .appendTo(statusBox);

    var progressBar = $("<div/>")
        .progressbar()
        .hide()
        .appendTo(statusBox);

    var cancelLink = $('<a href="#"/>')
        .text("Cancel")
        .hide()
        .click(function() {
            RB.Offline.goOnline();
            return false;
        })
        .appendTo(statusBox);

    $(window)
        .bind("resize.offlineStatusBox", function() {
            statusBox.css("left", stateIcon.offset().left);
        })
        .triggerHandler("resize.offlineStatusBox");

    var prevState = null;

    /* Hook into the offline support. */
    RB.Offline.onStateChanged = function(state) {
        var iconName;
        var showBox = false;
        var hideBox = false;

        if (state == RB.Offline.STATE_ONLINE) {
            iconName = "off-connected-synced.gif";
            statusLabel.text("You are online.");

            if (prevState != null) {
                progressBar.hide();
                cancelLink.hide();
                showBox = true;
                hideBox = true;
            }
        }
        else if (state == RB.Offline.STATE_OFFLINE) {
            iconName = "off-disconnected.gif";
            statusLabel.text("You are now in offline mode.");
            hideBox = true;
            progressBar.hide();
            cancelLink.hide();
        }
        else if (state == RB.Offline.STATE_CALC_SYNC) {
            iconName = "off-connected-syncing.gif";
            statusLabel.text("Preparing to download files...");
            showBox = true;
            progressBar.show();
            cancelLink.show();
        }
        else if (state == RB.Offline.STATE_SYNCING) {
            iconName = "off-connected-syncing.gif";
            statusLabel.text("Download files...");
        }

        if (showBox) {
            var stateIconOffset = stateIcon.offset();

            statusBox
                .css({
                    opacity: 0,
                    left: stateIconOffset.left,
                    top: stateIconOffset.top + stateIcon.height() - 10
                })
                .show()
                .animate({
                    top: "+=10px",
                    opacity: 1
                }, 350, "swing")
        }

        if (hideBox) {
            statusBox
                .delay(1000)
                .animate({
                    top: "-=10px",
                    opacity: 0
                }, 350, "swing", function() {
                    statusBox.hide();
                });
        }

        stateIcon.attr("src", MEDIA_URL + "rb/images/" + iconName +
                              "?" + MEDIA_SERIAL);

        prevState = state;
    }

    RB.Offline.onProgress = function(curFiles, totalFiles) {
        var pct = curFiles / totalFiles * 100;

        if (pct == 100) {
            statusLabel.text("Download complete.");
        }
        else {
            statusLabel.text("Downloading file " + (curFiles + 1) + " of " +
                             totalFiles);
        }

        progressBar.progressbar("value", curFiles / totalFiles * 100);
    }

    RB.Offline.init();

    return self;
}


$(document).ready(function() {
    $('<div id="activity-indicator" />')
        .text("Loading...")
        .hide()
        .appendTo("body");

    if (window.google && google.gears) {
        $("<li/>")
            .append(" - ")
            .insertAfter($("#accountnav li:first"))
            .syncIndicator();
    }
});

// vim: set et:sw=4:
