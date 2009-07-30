from django.dispatch import Signal


adding_manifest_urls = Signal(providing_args=["requeste", "urls",
                                              "latest_timestamp"])
