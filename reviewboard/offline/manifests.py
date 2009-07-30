from django.http import HttpResponse
from django.utils import simplejson


class GearsManifestResponse(HttpResponse):
    SUPPORTED_FIELDS = ["url", "matchQuery", "redirect", "ignoreQuery"]
    def __init__(self, request, version, entries):
        encoder = simplejson.JSONEncoder()

        new_entries = []

        for entry in entries:
            new_entry = {}

            for fieldname in self.SUPPORTED_FIELDS:
                if fieldname in entry:
                    new_entry[fieldname] = entry[fieldname]

                if 'matchQuery' in new_entry and "?" in new_entry['url']:
                    new_entry['url'] = new_entry['url'].split("?")[0]

            new_entries.append(new_entry)

        HttpResponse.__init__(self, encoder.encode({
            'betaManifestVersion': 2,
            'version': str(version),
            'entries': new_entries,
        }), mimetype="application/json")


class Html5ManifestResponse(HttpResponse):
    def __init__(self, request, version, entries):
        data = [
            "CACHE MANIFEST",
            "# v%s" % version
        ]

        for entry in entries:
            data.append(entry['url'])

        HttpResponse.__init__(self, "\n".join(data),
                              mimetype="text/cache-manifest")
