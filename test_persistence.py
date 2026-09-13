import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import server


class PersistenceTests(unittest.TestCase):
    def test_free_server_restart_requires_full_refresh_for_stale_base(self):
        with patch.object(server, 'selected_category_slugs', return_value=(['lapte'], 'lapte')):
            self.assertEqual(server.safe_refresh_scope({'base_generated_at': 'B'}, {'generated_at': 'B'}), (['lapte'], 'lapte'))
            self.assertIsNone(server.safe_refresh_scope({'base_generated_at': 'B'}, {'generated_at': 'A'})[0])
            self.assertIsNone(server.safe_refresh_scope({}, {'generated_at': 'A'})[0])

    def test_restart_seed_and_downgrade(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            active = root / 'data' / 'products.json'
            seed = {'generated_at': '2026-01-01 00:00:00', 'products': [{'name': 'A', 'price': 1}]}
            (root / 'products.json').write_text(json.dumps(seed), encoding='utf8')
            with patch.multiple(server, ROOT=root, DATA_ROOT=active.parent, PRODUCTS_FILE=active), patch.dict(os.environ, {}, clear=True):
                server.initialize_catalog()
                self.assertEqual(json.loads(active.read_text()), seed)
                for label, date in [('B', '2026-02-01'), ('C', '2026-03-01')]:
                    catalog = {'generated_at': date, 'products': [{'name': label, 'price': 2}]}
                    server.save_products(catalog)
                    for _ in range(3):
                        server.initialize_catalog()
                        self.assertEqual(json.loads(active.read_text()), catalog)
                    with self.assertRaises(ValueError):
                        server.save_products(seed)
                    with self.assertRaises(ValueError):
                        server.save_products({'products': []})
                    self.assertEqual(json.loads(active.read_text()), catalog)
                active.write_text('broken', encoding='utf8')
                with self.assertRaises(ValueError):
                    server.initialize_catalog()
                self.assertEqual(active.read_text(), 'broken')


if __name__ == '__main__':
    unittest.main()
