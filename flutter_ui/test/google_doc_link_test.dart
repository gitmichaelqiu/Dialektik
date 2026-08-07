import 'package:flutter_test/flutter_test.dart';

import 'package:dialektik_flutter_ui/src/services/google_doc_link.dart';

void main() {
  group('GoogleDocLink', () {
    test('normalizes an edit link and removes query parameters', () {
      final link = GoogleDocLink.parse(
        'https://docs.google.com/document/d/abc_DEF-123/edit?usp=sharing',
      );

      expect(link.documentId, 'abc_DEF-123');
      expect(
        link.editUrl.toString(),
        'https://docs.google.com/document/d/abc_DEF-123/edit',
      );
    });

    test('accepts a share link without an edit suffix', () {
      final link = GoogleDocLink.parse(
        'https://docs.google.com/document/d/document-id',
      );

      expect(
        link.editUrl.toString(),
        'https://docs.google.com/document/d/document-id/edit',
      );
    });

    test('rejects links that are not Google documents', () {
      expect(
        () => GoogleDocLink.parse('https://example.com/document/d/abc/edit'),
        throwsFormatException,
      );
      expect(
        () => GoogleDocLink.parse('https://docs.google.com/spreadsheets/d/abc'),
        throwsFormatException,
      );
    });
  });
}
